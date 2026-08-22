import { NextRequest } from "next/server";
import { Pool } from "pg";
import { decrypt } from "@/lib/crypto";
import { executeNativeTool, formatHtmlEmailBody, extractRecordsFromPayload, sanitizeTableCell } from "@/lib/tool-gateway";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function sanitizeDataPayloads(input: unknown): unknown {
  if (typeof input === "string") {
    // Truncate data URI base64 images (e.g. data:image/png;base64,...)
    const dataUriRegex = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
    let sanitized = input.replace(dataUriRegex, "[image_data_omitted]");

    // Truncate raw base64 strings longer than 200 characters
    const rawBase64Regex = /\b[A-Za-z0-9+/]{200,}[=]{0,2}\b/g;
    sanitized = sanitized.replace(rawBase64Regex, "[image_data_omitted]");

    return sanitized;
  }
  if (Array.isArray(input)) {
    return input.map(item => sanitizeDataPayloads(item));
  }
  if (input !== null && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const res: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      res[key] = sanitizeDataPayloads(obj[key]);
    }
    return res;
  }
  return input;
}

function getActionVerbFromToolName(toolName?: string | null): string {
  if (!toolName || typeof toolName !== "string") return "UNKNOWN";
  const name = toolName.toLowerCase();
  if (name.includes("create") || name.includes("add") || name.includes("insert") || name.includes("new")) return "CREATE";
  if (name.includes("update") || name.includes("modify") || name.includes("set") || name.includes("change")) return "UPDATE";
  if (name.includes("delete") || name.includes("remove") || name.includes("clear") || name.includes("destroy")) return "DELETE";
  if (name.includes("send") || name.includes("mail") || name.includes("notify") || name.includes("dispatch")) return "SEND";
  if (name.includes("list") || name.includes("get") || name.includes("read") || name.includes("query") || name.includes("find")) return "LIST";
  return "UNKNOWN";
}

function tryParseJson(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

interface ToolExecutionReceipt {
  tool_name: string;
  status: "SUCCESS" | "FAILED";
  output_payload: string;
}

function parseToolCalls(response: string): { name: string; arguments: Record<string, unknown> }[] {
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = response.match(jsonBlockRegex);
  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed.tool_calls)) return parsed.tool_calls;
      if (parsed.name && parsed.arguments) return [parsed];
    } catch { /* ignore */ }
  }
  const looseMatch = response.match(/({[\s\S]*?"tool_calls"[\s\S]*?})/);
  if (looseMatch) {
    try {
      const parsed = JSON.parse(looseMatch[1].trim());
      if (Array.isArray(parsed.tool_calls)) return parsed.tool_calls;
    } catch { /* ignore */ }
  }
  return [];
}

// ── Agent Inspector Pillar Helpers ──

async function ensureRagTable(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS agentflow_rag_chunks (
    id UUID PRIMARY KEY,
    namespace VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  // b-tree index for namespace lookups
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rag_chunks_ns ON agentflow_rag_chunks(namespace)`);
  // ivfflat index for vector similarity (silently skipped if pgvector not enabled)
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rag_chunks_embed ON agentflow_rag_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`);
  } catch { /* pgvector not available — vector search will fall back to text search */ }
}

async function ensureMemoryTable(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS agentflow_thread_memory (
    id UUID PRIMARY KEY,
    thread_id VARCHAR(255) NOT NULL,
    turn_number INTEGER NOT NULL DEFAULT 0,
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_thread_memory_tid ON agentflow_thread_memory(thread_id, turn_number)`);
}

async function ensureKvTable(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS agentflow_kv_store (
    namespace VARCHAR(255) NOT NULL,
    key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (namespace, key)
  )`);
}

async function ensurePiiAuditTable(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS agentflow_pii_audit_logs (
    id UUID PRIMARY KEY,
    thread_id VARCHAR(255) NOT NULL,
    node_label VARCHAR(255) NOT NULL DEFAULT '',
    pii_mode VARCHAR(50) NOT NULL,
    framework_triggered VARCHAR(50) DEFAULT '',
    entities_masked JSONB NOT NULL DEFAULT '[]',
    categories JSONB NOT NULL DEFAULT '[]',
    total_masked INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pii_audit_tid ON agentflow_pii_audit_logs(thread_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pii_audit_created ON agentflow_pii_audit_logs(created_at DESC)`);
}

interface ComplianceEntityRule {
  entity: string;
  label: string;
  action: "mask" | "tokenize" | "block";
  enabled: boolean;
}

interface ImportedFrameworkEntity {
  entity_key: string;
  label: string;
  default_action: "mask" | "tokenize" | "block";
  pattern?: string;
}

interface ImportedFramework {
  framework_id: string;
  name: string;
  regulatory_reference: string;
  description: string;
  entities: ImportedFrameworkEntity[];
  active?: boolean;
}

interface KeywordRule {
  keyword: string;
  action: "mask" | "tokenize" | "block";
}

interface ComplianceConfig {
  frameworks: string[];
  entityRules: ComplianceEntityRule[];
  customKeywords: KeywordRule[];
  customRegex: { pattern: string; label: string }[];
  importedFrameworks?: ImportedFramework[];
}

async function loadComplianceRules(): Promise<ComplianceConfig | null> {
  try {
    const res = await pool.query(
      'SELECT config FROM agentflow_compliance_rules ORDER BY updated_at DESC LIMIT 1'
    );
    if (res.rows.length === 0) return null;
    return res.rows[0].config as ComplianceConfig;
  } catch {
    return null;
  }
}

interface MaskingResult {
  masked: string;
  categories: { type: string; count: number; label: string }[];
  frameworkTriggered?: string;
  totalMasked: number;
}

/** Apply compliance masking with dynamic ruleset, token replacement, and framework presets */
async function applyComplianceMasking(text: string, piiMode?: string, complianceConfig?: ComplianceConfig | null): Promise<MaskingResult> {
  const fallbackResult: MaskingResult = { masked: text, categories: [], totalMasked: 0 };

  if (!piiMode || piiMode === "off") return fallbackResult;

  const config = complianceConfig;
  const categories: { type: string; count: number; label: string }[] = [];
  let masked = text;
  let frameworkTriggered: string | undefined;

  // Determine which frameworks are active
  const activeFrameworks = config?.frameworks || [];
  if (activeFrameworks.length > 0) {
    frameworkTriggered = activeFrameworks.join(",");
  }

  // Resolve entity-level actions from config or fall back to piiMode
  const entityRules = config?.entityRules || [];
  const getAction = (entity: string): "mask" | "tokenize" | "block" | undefined => {
    const rule = entityRules.find((r) => r.entity === entity && r.enabled);
    return rule?.action;
  };

  // Token counters for contextual replacement
  const tokenCounters: Record<string, { count: number; replacements: Map<string, string> }> = {};

  const applyTokenMask = (entityType: string, value: string): string => {
    if (!tokenCounters[entityType]) {
      tokenCounters[entityType] = { count: 0, replacements: new Map() };
    }
    const counter = tokenCounters[entityType];
    const existing = counter.replacements.get(value);
    if (existing) return existing;
    counter.count++;
    const token = `<${entityType.toUpperCase()}_${counter.count}>`;
    counter.replacements.set(value, token);
    return token;
  };

  const countAndCollect = (entityType: string, matches: RegExpMatchArray | null): number => {
    if (!matches) return 0;
    const action = getAction(entityType) || "mask";
    if (action === "block") {
      for (const m of matches) {
        masked = masked.replace(m, "[BLOCKED]");
      }
      return matches.length;
    }
    if (action === "tokenize") {
      for (const m of matches) {
        masked = masked.replace(m, applyTokenMask(entityType, m));
      }
      return matches.length;
    }
    // mask — use standard redaction
    const label = entityRules.find((r) => r.entity === entityType)?.label || entityType;
    const placeholder = `[${label.toUpperCase().replace(/[^A-Z]/g, "_")}_REDACTED]`;
    for (const m of matches) {
      masked = masked.replace(m, placeholder);
    }
    return matches.length;
  };

  // Apply entity-level regex matches
  const emailRule = entityRules.find((r) => r.entity === "email");
  if ((piiMode === "all" || piiMode === "email") && (!emailRule || emailRule.enabled)) {
    const matches = masked.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
    const count = countAndCollect("email", matches as RegExpMatchArray | null);
    if (count > 0) categories.push({ type: "email", count, label: "Email" });
  }

  const phoneRule = entityRules.find((r) => r.entity === "phone");
  if ((piiMode === "all" || piiMode === "phone") && (!phoneRule || phoneRule.enabled)) {
    const matches = masked.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g);
    const count = countAndCollect("phone", matches as RegExpMatchArray | null);
    if (count > 0) categories.push({ type: "phone", count, label: "Phone Number" });
  }

  const ssnRule = entityRules.find((r) => r.entity === "ssn");
  if ((piiMode === "all" || piiMode === "ssn") && (!ssnRule || ssnRule.enabled)) {
    const matches = masked.match(/\b\d{3}-\d{2}-\d{4}\b/g);
    const count = countAndCollect("ssn", matches as RegExpMatchArray | null);
    if (count > 0) categories.push({ type: "ssn", count, label: "SSN / National ID" });
  }

  // Credit card detection (PCI-DSS)
  const ccRule = entityRules.find((r) => r.entity === "credit_card");
  if (ccRule?.enabled !== false) {
    const matches = masked.match(/\b(?:\d{4}[-.\s]?){3,4}\d{4}\b/g);
    const count = countAndCollect("credit_card", matches as RegExpMatchArray | null);
    if (count > 0) categories.push({ type: "credit_card", count, label: "Credit Card / CVV" });
  }

  // IBAN / Bank Account detection
  const ibanRule = entityRules.find((r) => r.entity === "iban");
  if (ibanRule?.enabled !== false) {
    const matches = masked.match(/\b[A-Z]{2}\d{2}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{0,4}\b/g);
    const count = countAndCollect("iban", matches as RegExpMatchArray | null);
    if (count > 0) categories.push({ type: "iban", count, label: "IBAN / Bank Account" });
  }

  // IP Address detection
  const ipRule = entityRules.find((r) => r.entity === "ip_address");
  if (ipRule?.enabled !== false) {
    const matches = masked.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g);
    const count = countAndCollect("ip_address", matches as RegExpMatchArray | null);
    if (count > 0) categories.push({ type: "ip_address", count, label: "IP Address" });
  }

  // Location detection (simple city/state/zip patterns)
  const locRule = entityRules.find((r) => r.entity === "location");
  if (locRule?.enabled !== false) {
    const matches = masked.match(/\b\d{5}(?:-\d{4})?\b/g);
    const count = countAndCollect("location", matches as RegExpMatchArray | null);
    if (count > 0) categories.push({ type: "location", count, label: "Location (ZIP)" });
  }

  // Person name detection (crude heuristic — capitalized words after titles)
  const nameRule = entityRules.find((r) => r.entity === "person_name");
  if (nameRule?.enabled !== false) {
    const matches = masked.match(/\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+[A-Z][a-z]+\b/g);
    const count = countAndCollect("person_name", matches as RegExpMatchArray | null);
    if (count > 0) categories.push({ type: "person_name", count, label: "Person Name" });
  }

  // Imported framework entity pattern matching
  const importedFrameworks = config?.importedFrameworks || [];
  const activeImportedFrameworks = importedFrameworks.filter(f => f.active !== false);
  for (const fw of activeImportedFrameworks) {
    for (const ent of fw.entities) {
      if (!ent.pattern) continue;
      try {
        const patternRegex = new RegExp(ent.pattern, "gi");
        const existingRule = entityRules.find(r => r.entity === ent.entity_key);
        const action = existingRule?.enabled ? existingRule.action : ent.default_action;
        const matches = masked.match(patternRegex);
        if (matches) {
          if (action === "block") {
            for (const m of matches) masked = masked.replace(m, "[BLOCKED]");
          } else if (action === "tokenize") {
            for (const m of matches) masked = masked.replace(m, applyTokenMask(ent.entity_key, m));
          } else {
            const placeholder = `[${ent.label.toUpperCase().replace(/[^A-Z]/g, "_")}_REDACTED]`;
            for (const m of matches) masked = masked.replace(m, placeholder);
          }
          categories.push({ type: `imported_${fw.framework_id}_${ent.entity_key}`, count: matches.length, label: `${fw.name}: ${ent.label}` });
        }
      } catch { /* invalid regex pattern — skip */ }
    }
  }

  // Custom keyword matching with per-keyword action
  if (config?.customKeywords && config.customKeywords.length > 0) {
    let kwCount = 0;
    for (const kwRule of config.customKeywords) {
      const kw = typeof kwRule === "string" ? kwRule : kwRule.keyword;
      const action = typeof kwRule === "string" ? "mask" : (kwRule.action || "mask");
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const keywordRegex = new RegExp(`\\b${escaped}\\b`, "gi");
      const kwMatches = masked.match(keywordRegex);
      if (kwMatches) {
        kwCount += kwMatches.length;
        if (action === "block") {
          masked = masked.replace(keywordRegex, "[KEYWORD_BLOCKED]");
        } else if (action === "tokenize") {
          for (const m of kwMatches) masked = masked.replace(m, applyTokenMask(`keyword_${kw}`, m));
        } else {
          masked = masked.replace(keywordRegex, "[KEYWORD_REDACTED]");
        }
      }
    }
    if (kwCount > 0) categories.push({ type: "custom_keyword", count: kwCount, label: "Custom Keywords" });
  }

  // Custom regex rules
  if (config?.customRegex && config.customRegex.length > 0) {
    for (const cr of config.customRegex) {
      try {
        const crRegex = new RegExp(cr.pattern, "gi");
        const crMatches = masked.match(crRegex);
        if (crMatches) {
          masked = masked.replace(crRegex, `[${cr.label.toUpperCase().replace(/[^A-Z]/g, "_")}_REDACTED]`);
          categories.push({ type: `custom_${cr.label.replace(/\s+/g, "_").toLowerCase()}`, count: crMatches.length, label: cr.label });
        }
      } catch { /* invalid regex pattern — skip silently */ }
    }
  }

  const totalMasked = categories.reduce((sum, c) => sum + c.count, 0);
  return { masked, categories, frameworkTriggered, totalMasked };
}

async function logPiiAudit(
  threadId: string,
  nodeLabel: string,
  piiMode: string,
  categories: { type: string; count: number; label: string }[],
  totalMasked: number,
  frameworkTriggered?: string,
  entitiesMasked?: string[]
): Promise<void> {
  try {
    await ensurePiiAuditTable();
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO agentflow_pii_audit_logs (id, thread_id, node_label, pii_mode, framework_triggered, entities_masked, categories, total_masked) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, threadId, nodeLabel, piiMode, frameworkTriggered || "", JSON.stringify(entitiesMasked || []), JSON.stringify(categories), totalMasked]
    );
  } catch {
    // non-fatal
  }
}

async function queryRagContext(namespace: string, embedModel?: string): Promise<string> {
  try {
    await ensureRagTable();
    let res;
    if (embedModel) {
      // Attempt vector similarity search when an embedding model is configured
      try {
        res = await pool.query(
          `SELECT content FROM agentflow_rag_chunks WHERE namespace = $1 AND embedding IS NOT NULL ORDER BY embedding <=> (SELECT embedding FROM agentflow_rag_chunks WHERE namespace = $1 AND embedding IS NOT NULL LIMIT 1) LIMIT 5`,
          [namespace]
        );
      } catch {
        // pgvector not available — fall through to text search
        res = null;
      }
    }
    if (!res || res.rows.length === 0) {
      res = await pool.query(
        'SELECT content FROM agentflow_rag_chunks WHERE namespace = $1 ORDER BY created_at DESC LIMIT 10',
        [namespace]
      );
    }
    if (res.rows.length === 0) return "";
    const results = res.rows.map(r => r.content).join("\n\n");
    return results + (embedModel ? `\n[Embedding model: ${embedModel}]` : "");
  } catch {
    return "";
  }
}

async function queryOkfFacts(): Promise<string> {
  try {
    const res = await pool.query(
      'SELECT category, fact_key, fact_value FROM okf_knowledge_facts ORDER BY updated_at DESC LIMIT 30'
    );
    if (res.rows.length === 0) return "";
    return res.rows.map(r => `[${r.category}] ${r.fact_key}: ${r.fact_value}`).join("\n");
  } catch {
    return "";
  }
}

async function loadThreadMemory(threadId: string): Promise<ChatMessage[]> {
  try {
    await ensureMemoryTable();
    const res = await pool.query(
      'SELECT role, content FROM agentflow_thread_memory WHERE thread_id = $1 ORDER BY turn_number ASC, created_at ASC LIMIT 50',
      [threadId]
    );
    return res.rows.map(r => ({ role: r.role, content: r.content })) as ChatMessage[];
  } catch {
    return [];
  }
}

async function saveThreadMemory(threadId: string, turnNumber: number, role: string, content: string): Promise<void> {
  try {
    await ensureMemoryTable();
    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO agentflow_thread_memory (id, thread_id, turn_number, role, content) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
      [id, threadId, turnNumber, role, content]
    );
  } catch {
    // non-fatal
  }
}

async function loadKvState(namespace: string): Promise<Record<string, string>> {
  try {
    await ensureKvTable();
    const res = await pool.query('SELECT key, value FROM agentflow_kv_store WHERE namespace = $1', [namespace]);
    const state: Record<string, string> = {};
    for (const row of res.rows) state[row.key] = row.value;
    return state;
  } catch {
    return {};
  }
}

async function saveKvState(namespace: string, state: Record<string, string>): Promise<void> {
  try {
    await ensureKvTable();
    for (const [key, value] of Object.entries(state)) {
      await pool.query(
        `INSERT INTO agentflow_kv_store (namespace, key, value) VALUES ($1, $2, $3)
         ON CONFLICT (namespace, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [namespace, key, value]
      );
    }
  } catch {
    // non-fatal
  }
}

interface LLMProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  models?: string[];
  discoveredModels?: string[];
}

async function fetchMcpToolsList(serverUrl: string, headers: Record<string, string>): Promise<{ name: string; description?: string; inputSchema?: Record<string, unknown> }[]> {
  try {
    let url = serverUrl;
    const isDocker = process.env.DATABASE_URL?.includes("savazai-db");
    if (isDocker && url.includes("localhost")) {
      url = url.replace("localhost", "host.docker.internal");
    }
    const listRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: AbortSignal.timeout(8000)
    });
    if (listRes.ok) {
      const listData = await listRes.json() as { result?: { tools?: { name: string; description?: string; inputSchema?: Record<string, unknown> }[] } };
      return listData?.result?.tools || [];
    }
  } catch {}
  return [];
}

// Stateless HTTP POST caller — generic JSON-RPC 2.0 MCP tool dispatcher
async function callMcpStatelessOrSse(
  sseUrl: string,
  token: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const payload = {
    jsonrpc: "2.0",
    id: `call-${toolName}-${Date.now()}`,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args
    }
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(sseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": token.startsWith("Bearer ") ? token : `Bearer ${token}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

  if (response.ok) {
    const data = await response.json() as Record<string, unknown>;
    console.log(`[MCP RESPONSE]: tool=${toolName} server=${sseUrl} raw=${JSON.stringify(data)}`);

    if (data && data.error) {
      // Passthrough MCP errors directly — do NOT throw or wrap
      const errMsg = typeof data.error === "object" && data.error !== null
        ? String((data.error as Record<string, unknown>).message || JSON.stringify(data.error))
        : String(data.error);
      return { isError: true, content: [{ type: "text", text: errMsg }] };
    }

    if (data && data.result !== undefined) {
      return data.result;
    }
  }
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    return { isError: true, content: [{ type: "text", text: `MCP timeout/error: ${errMsg}` }] };
  }

  // Fallback to stateful SSE client (only on HTTP failure, not on MCP error)
  console.warn("[OrchestratorTest] Direct POST non-ok, falling back to SSE stream for:", sseUrl);
  return callMcpSse(sseUrl, token, toolName, args);
}

// Stateful SSE client to route tool invocations dynamically
async function callMcpSse(sseUrl: string, token: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const parsedUrl = new URL(sseUrl);
  const res = await fetch(sseUrl, {
    headers: {
      'Authorization': token.startsWith("Bearer ") ? token : `Bearer ${token}`,
      'Accept': 'text/event-stream'
    }
  });
  if (!res.ok) {
    throw new Error(`SSE handshaking failed with status ${res.status}`);
  }
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No SSE body reader");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let postUrl = "";
  const requestId = `call-${toolName}-${Date.now()}`;
  
  // Read stream events
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    
    for (const eventText of events) {
      if (!postUrl) {
        const lines = eventText.split('\n');
        const dataLine = lines.find(l => l.startsWith('data:'));
        if (dataLine) {
          const path = dataLine.substring(5).trim();
          const base = `${parsedUrl.protocol}//${parsedUrl.host}`;
          postUrl = `${base}${path}`;
          
          // Send initialize
          const initPayload = {
            jsonrpc: "2.0",
            id: `init-${requestId}`,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "savazai-client", version: "1.0.0" }
            }
          };
          await fetch(postUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': token.startsWith("Bearer ") ? token : `Bearer ${token}` },
            body: JSON.stringify(initPayload)
          });
          
          const initializedPayload = {
            jsonrpc: "2.0",
            method: "notifications/initialized"
          };
          await fetch(postUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': token.startsWith("Bearer ") ? token : `Bearer ${token}` },
            body: JSON.stringify(initializedPayload)
          });
        }
      } else if (eventText.includes(`init-${requestId}`)) {
        // Initialize complete. Send the tool call!
        const commandPayload = {
          jsonrpc: "2.0",
          id: requestId,
          method: "tools/call",
          params: { name: toolName, arguments: args }
        };
        await fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': token.startsWith("Bearer ") ? token : `Bearer ${token}` },
          body: JSON.stringify(commandPayload)
        });
      } else if (eventText.includes(requestId)) {
        // Tool call output received!
        const lines = eventText.split('\n');
        const dataLine = lines.find(l => l.startsWith('data:'));
        if (dataLine) {
          const rawJson = dataLine.substring(5).trim();
          const parsed = JSON.parse(rawJson);
          reader.cancel(); // Close the stream
          console.log(`[MCP RESPONSE]: tool=${toolName} sse=true raw=${rawJson}`);
          if (parsed.error) {
            const errMsg = typeof parsed.error === "object" && parsed.error !== null
              ? String((parsed.error as Record<string, unknown>).message || JSON.stringify(parsed.error))
              : String(parsed.error);
            return { isError: true, content: [{ type: "text", text: errMsg }] };
          }
          return parsed.result;
        }
      }
    }
  }
  throw new Error("SSE connection closed before response received");
}

function parseNaturalLanguageDate(input: string): string {
  if (!input || typeof input !== "string") return input;
  const str = input.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) return str;

  const MONTHS: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
  };

  const monthNameMatch = str.match(/([a-z]+)\s+(\d+)(?:st|nd|rd|th)?\s*,?\s*(\d{4})(?:\s+(?:at\s+)?(\d+)(?::(\d+))?\s*(am|pm)?)?/i);
  if (monthNameMatch) {
    const mName = monthNameMatch[1].toLowerCase();
    if (MONTHS[mName] !== undefined) {
      const month = MONTHS[mName];
      const day = parseInt(monthNameMatch[2], 10);
      const year = parseInt(monthNameMatch[3], 10);
      let hour = monthNameMatch[4] ? parseInt(monthNameMatch[4], 10) : 12;
      const min = monthNameMatch[5] ? parseInt(monthNameMatch[5], 10) : 0;
      const ampm = monthNameMatch[6] ? monthNameMatch[6].toLowerCase() : null;
      if (ampm === "pm" && hour < 12) hour += 12;
      if (ampm === "am" && hour === 12) hour = 0;
      return new Date(Date.UTC(year, month, day, hour, min, 0)).toISOString();
    }
  }

  const dayFirstMatch = str.match(/(\d+)(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})(?:\s+(?:at\s+)?(\d+)(?::(\d+))?\s*(am|pm)?)?/i);
  if (dayFirstMatch) {
    const mName = dayFirstMatch[2].toLowerCase();
    if (MONTHS[mName] !== undefined) {
      const day = parseInt(dayFirstMatch[1], 10);
      const month = MONTHS[mName];
      const year = parseInt(dayFirstMatch[3], 10);
      let hour = dayFirstMatch[4] ? parseInt(dayFirstMatch[4], 10) : 12;
      const min = dayFirstMatch[5] ? parseInt(dayFirstMatch[5], 10) : 0;
      const ampm = dayFirstMatch[6] ? dayFirstMatch[6].toLowerCase() : null;
      if (ampm === "pm" && hour < 12) hour += 12;
      if (ampm === "am" && hour === 12) hour = 0;
      return new Date(Date.UTC(year, month, day, hour, min, 0)).toISOString();
    }
  }

  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(?:at\s+)?(\d+)(?::(\d+))?\s*(am|pm)?)?/i);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    let hour = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
    const min = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
    const ampm = isoMatch[6] ? isoMatch[6].toLowerCase() : null;
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    return new Date(Date.UTC(year, month, day, hour, min, 0)).toISOString();
  }

  return str;
}

async function autoResolveMissingSystemIds(
  sseUrl: string,
  authHeader: string,
  toolName: string,
  args: Record<string, unknown>,
  nodeTools?: unknown[]
): Promise<Record<string, unknown>> {
  const lowerName = toolName.toLowerCase();
  const isReadTool =
    lowerName.startsWith("list_") ||
    lowerName.startsWith("get_") ||
    lowerName.startsWith("fetch_") ||
    lowerName.startsWith("read_") ||
    lowerName.startsWith("search_") ||
    lowerName.startsWith("query_") ||
    lowerName.startsWith("find_") ||
    lowerName.startsWith("show_");
  const isMutating = !isReadTool;
  if (!isMutating || !nodeTools || nodeTools.length === 0) return args;

  const newArgs = { ...args };

  // Extract assigned tool names from Agent Node configuration
  const assignedToolNames = nodeTools
    .map(t => (typeof t === "string" ? t : (t as Record<string, unknown>)?.name ? String((t as Record<string, unknown>).name) : ""))
    .filter(Boolean);

  // 1. Column / Kanban ID auto-resolution (generic status to column mapping for any task/kanban tool)
  const rawCol = String(newArgs.columnId || newArgs.column_id || "").trim();
  if (rawCol) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCol);
    if (!isUuid) {
      const taskListTool = assignedToolNames.find(n => {
        const lowerN = n.toLowerCase();
        return (lowerN.startsWith("list_") || lowerN.startsWith("get_") || lowerN.startsWith("fetch_") || lowerN.startsWith("search_")) &&
          (lowerN.includes("task") || lowerN.includes("column") || lowerN.includes("item") || lowerN.includes("board"));
      });
      if (taskListTool) {
        try {
          const listRes = await callMcpStatelessOrSse(sseUrl, authHeader, taskListTool, {}) as Record<string, unknown>;
          let tasksList: Record<string, unknown>[] = [];
          if (listRes && Array.isArray(listRes.content)) {
            const textBlock = (listRes.content as Record<string, unknown>[]).find(c => (c as Record<string, unknown>)?.type === "text");
            if (textBlock && typeof (textBlock as Record<string, unknown>).text === "string") {
              tasksList = JSON.parse((textBlock as Record<string, unknown>).text as string);
            }
          }
          if (Array.isArray(tasksList) && tasksList.length > 0) {
            const targetStr = (rawCol || String(newArgs.status || "")).toLowerCase().replace(/[^a-z0-9]/g, "");
            let matchedColumnId: string | null = null;
            let fallbackColumnId: string | null = null;

            for (const item of tasksList) {
              const cId = String(item.columnId || item.column_id || "");
              if (cId && cId !== "null" && cId.length > 5) {
                if (!fallbackColumnId) fallbackColumnId = cId;
                const itemStatus = String(item.status || item.columnName || item.column || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                if (targetStr && (itemStatus === targetStr || itemStatus.includes(targetStr) || targetStr.includes(itemStatus))) {
                  matchedColumnId = cId;
                  break;
                }
              }
            }
            const chosenColumnId = matchedColumnId || fallbackColumnId;
            if (chosenColumnId) {
              newArgs.columnId = chosenColumnId;
              console.log(`[Auto-Resolution] Set columnId "${chosenColumnId}" for tool ${toolName} via assigned tool "${taskListTool}"`);
            }
          }
        } catch (colErr) {
          console.error("[Auto-Resolution] Failed to resolve columnId for task:", colErr);
        }
      }
    }
  }

  // 2. Universal Primary ID and Foreign key resolution (e.g. id, ceremonyId, guestId, assignedUserId, etc.)
  for (const [key, val] of Object.entries(newArgs)) {
    if (/^id$|Id$|_id$/i.test(key)) {
      const isPrimaryId = key.toLowerCase() === "id";
      const refEntity = isPrimaryId
        ? toolName.toLowerCase().replace(/^([a-z0-9]+)_/, "").replace(/s$/, "")
        : key.replace(/Id$|_id$/i, "").toLowerCase();

      if (!refEntity || refEntity.endsWith("id") || refEntity === "tenant" || refEntity === "workspace" || refEntity === "column" || refEntity === "parent" || refEntity === "root") continue;
      const strVal = String(val || "").trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strVal);

      if (isUuid) continue;

      // Find an ASSIGNED tool on this Agent node matching list_<refEntity> or get_<refEntity>
      const matchingListTool = assignedToolNames.find(tn => {
        const lowerTn = tn.toLowerCase();
        const isQuery =
          lowerTn.startsWith("list_") ||
          lowerTn.startsWith("get_") ||
          lowerTn.startsWith("fetch_") ||
          lowerTn.startsWith("search_") ||
          lowerTn.startsWith("read_") ||
          lowerTn.startsWith("query_") ||
          lowerTn.startsWith("find_") ||
          lowerTn.startsWith("show_");
        if (!isQuery) return false;

        const stemRef = refEntity.endsWith("y") ? refEntity.slice(0, -1) : refEntity;
        return lowerTn.includes(refEntity) || lowerTn.includes(stemRef);
      });

      if (matchingListTool) {
        try {
          const listRes = await callMcpStatelessOrSse(sseUrl, authHeader, matchingListTool, {}) as Record<string, unknown>;
          if (listRes && Array.isArray(listRes.content)) {
            const textBlock = (listRes.content as Record<string, unknown>[]).find(c => (c as Record<string, unknown>)?.type === "text");
            if (textBlock && typeof (textBlock as Record<string, unknown>).text === "string") {
              const refList = JSON.parse((textBlock as Record<string, unknown>).text as string);
              if (Array.isArray(refList) && refList.length > 0) {
                let matchedId: string | null = null;
                const searchTarget = (strVal && strVal !== "unknown" && strVal !== "null")
                  ? strVal
                  : String(newArgs.name || newArgs.title || newArgs.label || newArgs.subject || newArgs.item || "").trim();

                if (searchTarget) {
                  const normVal = searchTarget.toLowerCase().replace(/[^a-z0-9]/g, "");
                  const reversedList = refList.slice().reverse();
                  const matchedRecord = reversedList.find((r: Record<string, unknown>) => {
                    const candidateNames = Object.keys(r)
                      .filter(k => {
                        const lk = k.toLowerCase();
                        return lk.includes("name") || lk.includes("title") || lk.includes("label") || lk.includes("subject") || lk.includes("item") || lk.includes("email") || lk.includes("code");
                      })
                      .map(k => String(r[k]))
                      .filter(Boolean);

                    if (r.firstName || r.first_name || r.lastName || r.last_name) {
                      const combined = `${r.firstName || r.first_name || ""} ${r.lastName || r.last_name || ""}`.trim();
                      if (combined) candidateNames.push(combined);
                    }
                    return candidateNames.some(cn => {
                      const normCn = cn.toLowerCase().replace(/[^a-z0-9]/g, "");
                      return normCn && (normCn === normVal || normCn.includes(normVal) || normVal.includes(normCn));
                    });
                  });
                  if (matchedRecord && matchedRecord.id) {
                    matchedId = String(matchedRecord.id);
                  }
                }
                if (matchedId) {
                  newArgs[key] = matchedId;
                  console.log(`[Auto-Resolution] Resolved ${key} "${searchTarget}" -> UUID "${matchedId}" via assigned tool "${matchingListTool}"`);
                } else if (!isUuid) {
                  delete newArgs[key];
                  console.log(`[Auto-Resolution] Removed non-UUID string "${strVal}" for ${key} because no matching record was found in ${matchingListTool}`);
                }
              }
            }
          }
        } catch {
          if (!isUuid) delete newArgs[key];
        }
      } else if (!isUuid && strVal) {
        delete newArgs[key];
        console.log(`[Auto-Resolution] Stripped non-UUID string "${strVal}" for ${key} because no list tool for "${refEntity}" is assigned to node`);
      }
    }
  }

  return newArgs;
}

async function autoResolveOutputForeignUuids(
  toolOutputText: string,
  nodeTools?: unknown[]
): Promise<string> {
  if (!toolOutputText || !nodeTools || nodeTools.length === 0) return toolOutputText;

  let parsed: unknown;
  try {
    parsed = JSON.parse(toolOutputText);
  } catch {
    return toolOutputText;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return toolOutputText;

  let sseUrl = process.env.MCP_FALLBACK_URL || process.env.NEXT_PUBLIC_HARNESS_API_URL
    ? `${process.env.NEXT_PUBLIC_HARNESS_API_URL}/api/mcp`
    : "http://localhost:3056/api/mcp";
  let authHeader = process.env.MCP_FALLBACK_TOKEN
    ? `Bearer ${process.env.MCP_FALLBACK_TOKEN}`
    : "Bearer savaz_crawl_secret";

  try {
    const configRes = await pool.query(
      'SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1'
    );
    if (configRes.rows.length > 0 && configRes.rows[0].designTokens) {
      const tokens = configRes.rows[0].designTokens as Record<string, unknown>;
      const mcpServersVal = tokens.mcpServers;
      if (mcpServersVal) {
        let mcpServersObj: Record<string, unknown> = {};
        if (typeof mcpServersVal === "string") {
          try {
            const p = JSON.parse(mcpServersVal);
            mcpServersObj = p.mcpServers || p;
          } catch {}
        } else if (typeof mcpServersVal === "object") {
          const valObj = mcpServersVal as Record<string, unknown>;
          mcpServersObj = (valObj.mcpServers as Record<string, unknown>) || valObj;
        }
        for (const [, sVal] of Object.entries(mcpServersObj)) {
          const sc = sVal as Record<string, unknown>;
          if (sc && sc.serverUrl && sc.disabled !== true && sc.active !== false) {
            sseUrl = String(sc.serverUrl);
            const headers = sc.headers as Record<string, unknown>;
            if (headers) {
              authHeader = String(headers.Authorization || headers.authorization || authHeader);
            }
            break;
          }
        }
      }
    }
  } catch {}

  const isDocker = process.env.DATABASE_URL?.includes("savazai-db");
  if (isDocker && sseUrl.includes("localhost")) {
    sseUrl = sseUrl.replace("localhost", "host.docker.internal");
  }

  const assignedToolNames = nodeTools
    .map(t => (typeof t === "string" ? t : (t as Record<string, unknown>)?.name ? String((t as Record<string, unknown>).name) : ""))
    .filter(Boolean);

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuidCache = new Map<string, string>(); // UUID -> Display Name

  let modified = false;

  for (const item of parsed as Record<string, unknown>[]) {
    if (!item || typeof item !== "object") continue;

    for (const [key, val] of Object.entries(item)) {
      if (key.toLowerCase() === "id" || key.toLowerCase() === "_id") continue;

      if (typeof val === "string" && val.length >= 36) {
        const tokens = val.split(",").map(s => s.trim());
        const hasUuid = tokens.some(t => uuidRegex.test(t));

        if (hasUuid) {
          const refEntity = key
            .replace(/Id$|_id$/i, "")
            .replace(/^invited/i, "")
            .replace(/s$/, "")
            .toLowerCase();

          if (!refEntity) continue;

          let matchingListTool = assignedToolNames.find(tn => {
            const lowerTn = tn.toLowerCase();
            const isQuery = lowerTn.startsWith("list_") || lowerTn.startsWith("get_") || lowerTn.startsWith("fetch_") || lowerTn.startsWith("search_");
            if (!isQuery) return false;
            const stemRef = refEntity.endsWith("y") ? refEntity.slice(0, -1) : refEntity;
            return lowerTn.includes(refEntity) || lowerTn.includes(stemRef);
          });

          // Fallback: If no list tool for refEntity is explicitly assigned to node, attempt query tool for refEntity across connected MCP servers
          if (!matchingListTool) {
            const pluralRef = refEntity.endsWith("y") ? refEntity.slice(0, -1) + "ies" : refEntity + "s";
            matchingListTool = `list_${pluralRef}`;
          }

          if (matchingListTool) {
            const missingUuids = tokens.filter(t => uuidRegex.test(t) && !uuidCache.has(t));
            if (missingUuids.length > 0) {
              try {
                const listRes = await callMcpStatelessOrSse(sseUrl, authHeader, matchingListTool, {}) as Record<string, unknown>;
                if (listRes && Array.isArray(listRes.content)) {
                  const textBlock = (listRes.content as Record<string, unknown>[]).find(c => (c as Record<string, unknown>)?.type === "text");
                  if (textBlock && typeof (textBlock as Record<string, unknown>).text === "string") {
                    const refList = JSON.parse((textBlock as Record<string, unknown>).text as string);
                    if (Array.isArray(refList)) {
                      for (const r of refList as Record<string, unknown>[]) {
                        if (r.id && typeof r.id === "string") {
                          const nameVal = String(r.name || r.title || r.label || r.subject || r.item || r.id);
                          uuidCache.set(r.id, nameVal);
                        }
                      }
                    }
                  }
                }
              } catch (err) {
                console.error(`[Output UUID Resolution] Failed to fetch tool ${matchingListTool}:`, err);
              }
            }

            const resolvedTokens = tokens.map(t => (uuidRegex.test(t) && uuidCache.has(t) ? uuidCache.get(t)! : t));
            item[key] = resolvedTokens.join(", ");
            modified = true;
          }
        }
      }
    }
  }

  return modified ? JSON.stringify(parsed, null, 2) : toolOutputText;
}

async function runMcpToolWithResilience(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
  nodeTools?: unknown[]
): Promise<string> {
  // 1. Resolve active registered MCP endpoint and headers from database config (mcpServers)
  // Fallback endpoint: reads from env var so it works for any MCP domain without code changes.
  // Set NEXT_PUBLIC_HARNESS_API_URL and MCP_FALLBACK_TOKEN in .env / Docker secrets.
  let sseUrl = process.env.MCP_FALLBACK_URL || process.env.NEXT_PUBLIC_HARNESS_API_URL
    ? `${process.env.NEXT_PUBLIC_HARNESS_API_URL}/api/mcp`
    : "http://localhost:3056/api/mcp";
  let authHeader = process.env.MCP_FALLBACK_TOKEN
    ? `Bearer ${process.env.MCP_FALLBACK_TOKEN}`
    : "Bearer savaz_crawl_secret";
  
  try {
    const configRes = await pool.query(
      'SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1'
    );
    if (configRes.rows.length > 0 && configRes.rows[0].designTokens) {
      const tokens = configRes.rows[0].designTokens as Record<string, unknown>;
      const mcpServersVal = tokens.mcpServers;
      if (mcpServersVal) {
        let mcpServersObj: Record<string, unknown> = {};
        if (typeof mcpServersVal === "string") {
          try {
            const parsed = JSON.parse(mcpServersVal);
            mcpServersObj = parsed.mcpServers || parsed;
          } catch {}
        } else if (mcpServersVal && typeof mcpServersVal === "object") {
          const valObj = mcpServersVal as Record<string, unknown>;
          mcpServersObj = (valObj.mcpServers as Record<string, unknown>) || valObj;
        }

        // Look for server matching serverId or scan registered MCP servers for toolName
        let serverConfig = mcpServersObj[serverId] as Record<string, unknown>;
        if (!serverConfig) {
          for (const [, sVal] of Object.entries(mcpServersObj)) {
            const sc = sVal as Record<string, unknown>;
            if (!sc || !sc.serverUrl || sc.disabled === true || sc.active === false) continue;
            try {
              const h = (sc.headers as Record<string, string>) || {};
              const tools = await fetchMcpToolsList(String(sc.serverUrl), h);
              if (tools.some((t: { name: string }) => t.name === toolName)) {
                serverConfig = sc;
                break;
              }
            } catch {}
          }
        }
        if (!serverConfig) {
          for (const [, sVal] of Object.entries(mcpServersObj)) {
            const sc = sVal as Record<string, unknown>;
            if (sc && sc.serverUrl && sc.disabled !== true && sc.active !== false) {
              serverConfig = sc;
              break;
            }
          }
        }
        if (serverConfig) {
          if (typeof serverConfig.serverUrl === "string") {
            sseUrl = serverConfig.serverUrl;
          }
          const headers = serverConfig.headers as Record<string, unknown>;
          if (headers) {
            authHeader = String(headers.Authorization || headers.authorization || authHeader);
          }
        }
      }
    }
  } catch (dbErr) {
    console.error("[runMcpToolWithResilience] Failed to fetch connected apps, falling back.", dbErr);
  }

  // Map localhost to host.docker.internal when running in Docker bridge
  const isDocker = process.env.DATABASE_URL?.includes("savazai-db");
  if (isDocker && sseUrl.includes("localhost")) {
    sseUrl = sseUrl.replace("localhost", "host.docker.internal");
  }

  // Auto-resolve missing system IDs (such as columnId or foreign keys) using ONLY assigned node tools
  const resolvedArgs = await autoResolveMissingSystemIds(sseUrl, authHeader, toolName, args, nodeTools);

  try {
    const res = await callMcpStatelessOrSse(sseUrl, authHeader, toolName, resolvedArgs) as Record<string, unknown>;
    console.log(`[MCP RESPONSE]: tool=${toolName} url=${sseUrl} raw=${JSON.stringify(res)}`);

    // Passthrough MCP errors: if the MCP server returned isError, surface it directly
    if (res && (res.isError === true || res.error)) {
      const errContent = res.content;
      if (Array.isArray(errContent)) {
        const textBlock = errContent.find((c: unknown) => (c as Record<string, unknown>)?.type === "text");
        if (textBlock) {
          const errText = (textBlock as Record<string, unknown>).text as string;
          return JSON.stringify({ error: errText, isError: true });
        }
      }
      return JSON.stringify({ error: "MCP server returned an error", isError: true });
    }

    if (res && res.content) {
      if (Array.isArray(res.content)) {
        const contentArray = res.content as Record<string, unknown>[];
        const textBlock = contentArray.find(c => c && c.type === "text" && typeof c.text === "string");
        if (textBlock) {
          return textBlock.text as string;
        }
      }
      return typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    }
    return JSON.stringify(res || {});
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: errMsg, isError: true });
  }
}

function formatText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #4f46e5; text-decoration: none; font-weight: 500;">$1</a>')
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0f172a;">$1</strong>')
    .replace(/__(.*?)__/g, '<strong style="color: #0f172a;">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background-color: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 0.9em; color: #0f172a;">$1</code>');
}

function parseMarkdownToHtml(body: string, appTitle: string): string {
  const lines = body.split(/\r?\n/);
  const htmlParts: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (inList) {
      htmlParts.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
      listType = null;
    }
  };

  let idx = 0;
  while (idx < lines.length) {
    const rawLine = lines[idx];
    const line = rawLine.trim();

    // Check for start of a table (line with pipes)
    if (line.includes('|')) {
      closeList();
      const tableLines: string[] = [];
      while (idx < lines.length && lines[idx].trim().includes('|')) {
        tableLines.push(lines[idx].trim());
        idx++;
      }

      // Process gathered table lines
      let headers: string[] = [];
      const rows: string[][] = [];

      const delimiterIdx = tableLines.findIndex(l => {
        const cells = l.split('|').map(c => c.trim()).filter(c => c.length > 0);
        return cells.length > 0 && cells.every(c => /^[ \t:-]+$/.test(c) && c.includes('-'));
      });

      if (delimiterIdx > 0) {
        const headerLine = tableLines[delimiterIdx - 1];
        headers = headerLine.split('|').map(c => c.trim());
        if (headerLine.startsWith('|')) headers.shift();
        if (headerLine.endsWith('|') && headers.length > 0) headers.pop();

        for (let r = 0; r < tableLines.length; r++) {
          if (r === delimiterIdx || r === delimiterIdx - 1) continue;
          const rLine = tableLines[r];
          const cells = rLine.split('|').map(c => c.trim());
          if (rLine.startsWith('|')) cells.shift();
          if (rLine.endsWith('|') && cells.length > 0) cells.pop();
          if (cells.length > 0) rows.push(cells);
        }
      } else {
        const firstLine = tableLines[0];
        const firstCells = firstLine.split('|').map(c => c.trim());
        if (firstLine.startsWith('|')) firstCells.shift();
        if (firstLine.endsWith('|') && firstCells.length > 0) firstCells.pop();

        const isExplicitHeader = firstCells.some(c => /^(name|business|rating|review|address|phone|contact|website|email|status|title|item|details)$/i.test(c.replace(/[^a-zA-Z]/g, '')));
        if (isExplicitHeader && tableLines.length > 1) {
          headers = firstCells;
          for (let r = 1; r < tableLines.length; r++) {
            const rLine = tableLines[r];
            const cells = rLine.split('|').map(c => c.trim());
            if (rLine.startsWith('|')) cells.shift();
            if (rLine.endsWith('|') && cells.length > 0) cells.pop();
            if (cells.length > 0) rows.push(cells);
          }
        } else {
          const defaultHeaderNames = ["Business Name", "⭐ Rating", "Review Count", "Address", "📞 Contact", "🌐 Website / Maps"];
          headers = defaultHeaderNames.slice(0, firstCells.length);
          for (let r = 0; r < tableLines.length; r++) {
            const rLine = tableLines[r];
            const cells = rLine.split('|').map(c => c.trim());
            if (rLine.startsWith('|')) cells.shift();
            if (rLine.endsWith('|') && cells.length > 0) cells.pop();
            if (cells.length > 0) rows.push(cells);
          }
        }
      }

      let tableHtml = '<div style="overflow-x: auto; margin: 16px 0; border-radius: 8px; border: 1px solid #e2e8f0;">';
      tableHtml += '<table style="width: 100%; border-collapse: collapse; text-align: left; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; font-size: 13px; color: #334155;">';

      if (headers.length > 0) {
        tableHtml += '<thead style="background-color: #f1f5f9;"><tr>';
        for (const header of headers) {
          tableHtml += `<th style="padding: 10px 12px; font-weight: bold; color: #1e293b; border: 1px solid #e2e8f0; font-family: inherit; text-align: left;">${formatText(header)}</th>`;
        }
        tableHtml += '</tr></thead>';
      }

      tableHtml += '<tbody style="background-color: #ffffff;">';
      rows.forEach((row, rowIndex) => {
        const bg = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
        tableHtml += `<tr style="background-color: ${bg};">`;
        const cellCount = Math.max(headers.length, row.length);
        for (let i = 0; i < cellCount; i++) {
          const cellContent = row[i] || '';
          tableHtml += `<td style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #475569; font-family: inherit; vertical-align: top;">${formatText(cellContent)}</td>`;
        }
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody></table></div>';
      htmlParts.push(tableHtml);
      continue;
    }

    const isUnorderedList = line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ');
    const isOrderedList = /^\d+\.\s+/.test(line);

    if (isUnorderedList) {
      if (!inList || listType !== 'ul') {
        closeList();
        htmlParts.push('<ul style="margin: 8px 0 16px 20px; padding: 0; list-style-type: disc; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif;">');
        inList = true;
        listType = 'ul';
      }
      const itemText = line.replace(/^[-*•]\s+/, '');
      htmlParts.push(`<li style="margin: 4px 0; color: #475569;">${formatText(itemText)}</li>`);
      idx++;
      continue;
    }

    if (isOrderedList) {
      if (!inList || listType !== 'ol') {
        closeList();
        htmlParts.push('<ol style="margin: 8px 0 16px 20px; padding: 0; list-style-type: decimal; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif;">');
        inList = true;
        listType = 'ol';
      }
      const itemText = line.replace(/^\d+\.\s+/, '');
      htmlParts.push(`<li style="margin: 4px 0; color: #475569;">${formatText(itemText)}</li>`);
      idx++;
      continue;
    }

    closeList();

    if (line === '') {
      idx++;
      continue;
    }

    if (line.startsWith('#')) {
      const hashCount = (line.match(/^#+/) || [''])[0].length;
      const headerText = line.replace(/^#+\s*/, '');
      const sizes: Record<number, string> = { 1: '22px', 2: '18px', 3: '16px', 4: '14px' };
      const size = sizes[hashCount] || '14px';
      htmlParts.push(`<h${hashCount} style="margin: 16px 0 8px 0; font-size: ${size}; font-weight: 600; color: #1e293b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${formatText(headerText)}</h${hashCount}>`);
      idx++;
      continue;
    }

    if (line === '---' || line === '***' || line === '___') {
      htmlParts.push('<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />');
      idx++;
      continue;
    }

    htmlParts.push(`<p style="margin: 8px 0 16px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #475569; font-size: 14px; line-height: 1.6;">${formatText(line)}</p>`);
    idx++;
  }

  closeList();

  const htmlContent = htmlParts.join('\n');

  return `
<div style="background-color: #f3f4f6; padding: 30px 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; min-height: 100%;">
  <div style="max-width: 750px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #e5e7eb;">
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%); padding: 24px 32px; text-align: left;">
      <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: bold; font-family: inherit;">${appTitle}</h1>
    </div>
    <div style="padding: 32px; line-height: 1.6; font-size: 14px; color: #374151; font-family: inherit;">
      ${htmlContent}
    </div>
    <div style="padding: 16px 32px; background-color: #f9fafb; border-top: 1px solid #f3f4f6; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #9ca3af; font-family: inherit;">Sent automatically by ${appTitle}</p>
    </div>
  </div>
</div>
`.trim();
}

function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (!trimmed) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return false;
  // Reject dangerous or dummy domains
  const blockList = ["example.com", "test.com", "localhost", "local", "domain.com", "invalid"];
  const domain = trimmed.split("@")[1]?.toLowerCase() || "";
  if (blockList.some(b => domain === b || domain.endsWith("." + b))) return false;
  return true;
}

function isReadOnlyQuery(message?: string | null): boolean {
  if (!message || typeof message !== "string") return true;
  const lower = message.toLowerCase();

  // Rule A: Explicit report/list/overview requests ("create a report", "make a list", "generate a summary", "create a detailed report", "create a overview") are READ-ONLY QUERIES!
  if (/\b(create|generate|provide|show|make|display|build)\s+(a\s+)?([a-z0-9_-]+\s+)*(report|list|summary|overview|breakdown|table)\b/i.test(lower)) {
    return true;
  }

  // Rule B: If the prompt contains explicit entity creation/mutation verbs:
  if (/\b(create|add|insert|invite)\s+(a\s+new\s+)?[a-z0-9_-]+\b/i.test(lower) ||
      /\b(update|modify|change|edit|set|adjust|rename)\b/i.test(lower) ||
      /\b(delete|remove|cancel|destroy|drop|erase|clear)\b/i.test(lower)) {
    return false;
  }

  // Rule C: Standard query keywords ("list", "show", "view", "report", "get", "fetch") indicate a read-only query
  return true;
}

async function sendEmailReal(
  to: string,
  subject: string,
  body: string,
  providerConfigs: Record<string, LLMProviderConfig>,
  dbPool: Pool
): Promise<{ success: boolean; message: string; provider?: string }> {
  try {
    // 0. Validate required parameters
    if (!to || !to.trim() || !subject || !subject.trim() || !body || !body.trim()) {
      const missing = [];
      if (!to || !to.trim()) missing.push("recipient/to");
      if (!subject || !subject.trim()) missing.push("subject");
      if (!body || !body.trim()) missing.push("body/content");
      const errMsg = `Email dispatch rejected: Empty parameters: ${missing.join(", ")}`;
      console.error("[sendEmailReal] " + errMsg);
      return { success: false, message: errMsg };
    }
    if (!isValidEmail(to)) {
      const errMsg = `Email dispatch rejected: Invalid or blocked recipient email address "${to}".`;
      console.error("[sendEmailReal] " + errMsg);
      return { success: false, message: errMsg };
    }

    // 1. Fetch system configs from DB to resolve credentials
    const configRes = await dbPool.query(
      'SELECT app_title as "appTitle", design_tokens as "designTokens" FROM system_configurations LIMIT 1'
    );
    if (configRes.rows.length === 0) {
      return { success: false, message: "No system configurations found in DB" };
    }
    const appTitle = configRes.rows[0].appTitle || process.env.NEXT_PUBLIC_APP_TITLE || "SavazAI";
    const designTokens = configRes.rows[0].designTokens || {};

    const isAlreadyHtml = body.trim().startsWith("<") && /<[a-z][\s\S]*>/i.test(body);
    const formattedBody = isAlreadyHtml ? body : parseMarkdownToHtml(body, appTitle);

    // 2. Try SendGrid if configured
    if (designTokens.sendgridApiKey && designTokens.sendgridSenderEmail) {
      console.log("[sendEmailReal] Dispatching via SendGrid API...");
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${designTokens.sendgridApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: designTokens.sendgridSenderEmail },
          subject: subject,
          content: [{ type: "text/html", value: formattedBody }]
        })
      });
      if (res.ok) {
        return { success: true, message: `Email sent to ${to} via SendGrid.`, provider: "sendgrid" };
      } else {
        const errText = await res.text();
        const errMsg = `SendGrid API failed: ${errText}`;
        console.error("[sendEmailReal] " + errMsg);
        return { success: false, message: errMsg };
      }
    }

    // 3. Try Gmail if configured
    if (
      designTokens.gmailClientId &&
      designTokens.gmailClientSecret &&
      (designTokens.gmailRefreshToken || designTokens.OAUTH_REFRESH_TOKEN)
    ) {
      console.log("[sendEmailReal] Dispatching via Gmail OAuth API...");
      const clientId = decrypt(designTokens.gmailClientId);
      const clientSecret = decrypt(designTokens.gmailClientSecret);
      const refreshToken = decrypt(designTokens.gmailRefreshToken || designTokens.OAUTH_REFRESH_TOKEN || "");

      // Rotate oauth access token
      const oauthRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token"
        })
      });
      if (oauthRes.ok) {
        const oauthData = await oauthRes.json();
        const accessToken = oauthData.access_token;

        // Build base64 MIME RFC 2822 message
        const mimeParts = [
          `To: ${to}`,
          `Subject: =?utf-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`,
          "Mime-Version: 1.0",
          "Content-Type: text/html; charset=utf-8",
          "Content-Transfer-Encoding: base64",
          "",
          Buffer.from(formattedBody, "utf-8").toString("base64")
        ];
        const mime = mimeParts.join("\r\n");
        const base64Mime = Buffer.from(mime, "utf-8")
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ raw: base64Mime })
        });
        if (sendRes.ok) {
          return { success: true, message: `Email sent to ${to} via Gmail.`, provider: "gmail" };
        } else {
          const errText = await sendRes.text();
          const errMsg = `Gmail Send API failed: ${errText}`;
          console.error("[sendEmailReal] " + errMsg);
          return { success: false, message: errMsg };
        }
      } else {
        const errText = await oauthRes.text();
        const errMsg = `Gmail OAuth rotation failed: ${errText}`;
        console.error("[sendEmailReal] " + errMsg);
        return { success: false, message: errMsg };
      }
    }

    // 4. Local fallback trace if credentials aren't fully configured
    console.log(`[sendEmailReal] No live credentials configured. Falling back to local logging.`);
    return {
      success: true,
      message: `[Simulated Dev Mode] Email dispatched successfully to ${to} with subject "${subject}"`,
      provider: "simulated"
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[sendEmailReal] Error during email dispatch execution:", errMsg);
    return { success: false, message: `Failed to execute send-email: ${errMsg}` };
  }
}

async function logTelemetryEvent(params: {
  provider?: string;
  modelName?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  executionLatencyMs?: number;
  executedMcpTools?: { toolName: string; latencyMs: number; statusCode: number; estimatedToolCost?: number }[];
  transactionCost?: number;
}) {
  try {
    const input = params.inputTokens || 0;
    const output = params.outputTokens || 0;
    const cost = params.transactionCost ?? ((input * 0.00015 / 1000) + (output * 0.0006 / 1000));
    
    await pool.query(
      `INSERT INTO telemetry_logs (
        provider, model_name, input_tokens, output_tokens, reasoning_tokens, execution_latency_ms, executed_mcp_tools, transaction_cost, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        params.provider || "openai",
        params.modelName || "gpt-4o-mini",
        input,
        output,
        params.reasoningTokens || 0,
        params.executionLatencyMs || 0,
        JSON.stringify(params.executedMcpTools || []),
        cost
      ]
    );
  } catch (err) {
    console.error("[Telemetry Log Error]:", err);
  }
}

// Direct HTTP request helper for OpenAI / Anthropic / Gemini with retry resilience
async function queryLLMDirectly(
  provider: string,
  modelName: string,
  systemPrompt: string,
  userMessage: string,
  providerConfigs: Record<string, LLMProviderConfig>
): Promise<string> {
  const prov = providerConfigs[provider];
  if (!prov || !prov.apiKey) {
    return `[Missing API Key for provider ${provider}] Simulated answer for model ${modelName}: Processing prompt with system context: "${systemPrompt.slice(0, 40)}..." and message: "${userMessage}"`;
  }
  
  const decryptedKey = decrypt(prov.apiKey);
  const startTime = Date.now();
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (provider === "openai" || provider === "openai-compatible") {
        const url = prov.baseUrl || "https://api.openai.com/v1/chat/completions";
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${decryptedKey}`
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage }
            ]
          })
        });
        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || "";
          const inTok = data.usage?.prompt_tokens || Math.ceil((systemPrompt.length + userMessage.length) / 4);
          const outTok = data.usage?.completion_tokens || Math.ceil(content.length / 4);
          logTelemetryEvent({
            provider,
            modelName,
            inputTokens: inTok,
            outputTokens: outTok,
            executionLatencyMs: Date.now() - startTime
          });
          return content;
        }
        const errText = await res.text();
        throw new Error(`OpenAI API status ${res.status}: ${errText}`);
      } 
      
      if (provider === "anthropic") {
        const url = prov.baseUrl || "https://api.anthropic.com/v1/messages";
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": decryptedKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: modelName,
            max_tokens: 2048,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }]
          })
        });
        if (res.ok) {
          const data = await res.json();
          return data.content?.[0]?.text || "";
        }
        const errText = await res.text();
        throw new Error(`Anthropic API status ${res.status}: ${errText}`);
      }

      if (provider === "gemini") {
        const url = prov.baseUrl || `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${decryptedKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              { role: "user", parts: [{ text: `System Instructions: ${systemPrompt}\n\nUser Message: ${userMessage}` }] }
            ]
          })
        });
        if (res.ok) {
          const data = await res.json();
          return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }
        const errText = await res.text();
        throw new Error(`Gemini API status ${res.status}: ${errText}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isTransient = errMsg.includes("500") || errMsg.includes("502") || errMsg.includes("503") || errMsg.includes("429") || errMsg.includes("fetch failed");
      if (attempt < 3 && isTransient) {
        console.warn(`[LLM Direct Retry] Attempt ${attempt} failed for ${provider}/${modelName} (${errMsg}). Retrying in ${attempt * 1000}ms...`);
        await new Promise(r => setTimeout(r, attempt * 1000));
        continue;
      }
      console.error(`LLM Query Failure for ${provider}/${modelName} (attempt ${attempt}):`, errMsg);
    }
  }

  // Resilient mock fallback in case of direct API connection timeouts / failures
  return `[Resilient Mock Mode] Response from ${provider}/${modelName}:\nTask instruction received: "${userMessage}".\nProcessing complete under directive: "${systemPrompt.slice(0, 50)}...".`;
}

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  name?: string;
}

interface McpToolInputSchema {
  type: "object";
  properties: Record<string, { type: string; description: string }>;
  required?: string[];
}

interface AgentflowTool {
  name: string;
  category?: string;
  description?: string;
  serverId?: string;
  inputSchema?: McpToolInputSchema;
}

interface GraphNode {
  id: string;
  label: string;
  systemPrompt?: string;
  roleTemplate?: string;
  tools?: AgentflowTool[];
  modelConfig: {
    provider: string;
    model: string;
  };
  skills?: unknown;
  knowledge?: unknown;
  ragNamespace?: string;
  embedModel?: string;
  hitlPolicy?: "always" | "on_delete" | "on_mutate" | "never";
  memoryCheckpoint?: boolean;
  kvPersistence?: boolean;
  piiMaskingOverride?: string;
  data?: {
    guardrails?: {
      hitlPolicy?: string;
    };
  };
}

interface ExecutionPlanItem {
  nodeId: string;
  targetNode: string;
  actionVerb: string;
  allowedVerbs: string[];
  targetEntity: string;
  parameters: Record<string, unknown>;
  requiresClarification?: boolean;
  warning?: string;
  clarificationPrompt?: string;
}

function shouldInterceptHITL(policy?: string | null, toolName?: string | null): boolean {
  if (!policy || typeof policy !== "string") return false;
  const p = policy.toLowerCase();
  if (p === "always") {
    return true;
  }
  
  const verb = getActionVerbFromToolName(toolName);
  
  if (p === "on_delete") {
    return (toolName && typeof toolName === "string" ? toolName.toLowerCase().startsWith("delete_") : false) || verb === "DELETE";
  }
  if (p === "on_mutation") {
    return ["CREATE", "UPDATE", "DELETE"].includes(verb);
  }
  
  return false;
}


function topologicalSort(
  nodeIds: string[],
  typedEdges: { source: string; target: string }[]
): string[] {
  const order: string[] = [];
  const visited = new Set<string>();

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);

    // Find nodes that point to this node (incoming dependencies)
    const dependencies = typedEdges
      .filter(e => e.target === id && nodeIds.includes(e.source))
      .map(e => e.source);

    for (const depId of dependencies) {
      visit(depId);
    }
    order.push(id);
  }

  for (const id of nodeIds) {
    visit(id);
  }

  return order;
}

async function queryLLMWithHistory(
  provider: string,
  modelName: string,
  systemPrompt: string,
  messages: ChatMessage[],
  providerConfigs: Record<string, LLMProviderConfig>,
  tools?: AgentflowTool[],
  toolChoice?: string
): Promise<string> {
  const prov = providerConfigs[provider];
  if (!prov || !prov.apiKey) {
    return `[Missing API Key for provider ${provider}] Simulated answer for model ${modelName}: Processing messages history with system context: "${systemPrompt.slice(0, 40)}..."`;
  }
  
  const decryptedKey = decrypt(prov.apiKey);
  const startTime = Date.now();
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (provider === "openai" || provider === "openai-compatible") {
        const url = prov.baseUrl || "https://api.openai.com/v1/chat/completions";
        
        const apiMessages = [
          { role: "system", content: systemPrompt },
          ...messages.map(m => {
            if (m.role === "tool") {
              return { role: "user", content: `[Tool Output for ${m.name || "tool"}]: ${m.content}` };
            }
            return { role: m.role, content: m.content };
          })
        ];

        const requestBody: Record<string, unknown> = {
          model: modelName,
          messages: apiMessages
        };

        if (tools && tools.length > 0) {
          requestBody.tools = tools.map(t => {
            const tName = t.name || "";
            const tDesc = t.description || "Execute tool call.";
            const schema = t.inputSchema;
            const params: Record<string, unknown> = {
              type: "object",
              properties: {} as Record<string, unknown>,
            };
            if (schema && schema.properties) {
              params.properties = schema.properties;
            }
            if (schema && schema.required && schema.required.length > 0) {
              params.required = schema.required;
            } else {
              params.additionalProperties = true;
            }
            return {
              type: "function",
              function: {
                name: tName,
                description: tDesc,
                parameters: params
              }
            };
          });
          if (toolChoice === "required") {
            requestBody.tool_choice = "required";
          }
        }

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${decryptedKey}`
          },
          body: JSON.stringify(requestBody)
        });
        if (res.ok) {
          const data = await res.json();
          const inTok = data.usage?.prompt_tokens || 0;
          const outTok = data.usage?.completion_tokens || 0;
          logTelemetryEvent({
            provider,
            modelName,
            inputTokens: inTok,
            outputTokens: outTok,
            executionLatencyMs: Date.now() - startTime
          });
          const choice = data.choices?.[0] as {
            message?: {
              content?: string;
              tool_calls?: {
                function: {
                  name: string;
                  arguments: string;
                };
              }[];
            };
          } | undefined;
          if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
            const formattedCalls = choice.message.tool_calls.map((tc) => {
              let args = {};
              try {
                args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
              } catch {}
              return {
                name: tc.function.name,
                arguments: args
              };
            });
            return "```json\n" + JSON.stringify({ tool_calls: formattedCalls }, null, 2) + "\n```";
          }
          return choice?.message?.content || "";
        }
        const errText = await res.text();
        throw new Error(`OpenAI API status ${res.status}: ${errText}`);
      } 
      
      if (provider === "anthropic") {
        const url = prov.baseUrl || "https://api.anthropic.com/v1/messages";
        
        const apiMessages: { role: "user" | "assistant"; content: string }[] = [];
        for (const m of messages) {
          const role = (m.role === "tool" || m.role === "system") ? "user" : m.role;
          const content = m.role === "tool" ? `[Tool Output for ${m.name || "tool"}]: ${m.content}` : m.content;
          
          const last = apiMessages[apiMessages.length - 1];
          if (last && last.role === role) {
            last.content += `\n\n${content}`;
          } else {
            apiMessages.push({ role, content });
          }
        }

        const apiTools = (tools || []).map(t => {
          const tName = t.name || "";
          const tDesc = t.description || "Execute tool call.";
          const schema = t.inputSchema;
          return {
            name: tName,
            description: tDesc,
            input_schema: {
              type: "object",
              properties: schema?.properties || {},
              required: schema?.required || []
            }
          };
        });

        const requestBody: Record<string, unknown> = {
          model: modelName,
          max_tokens: 2048,
          system: systemPrompt,
          messages: apiMessages
        };
        if (apiTools.length > 0) {
          requestBody.tools = apiTools;
          if (toolChoice === "required") {
            requestBody.tool_choice = { type: "any" };
          }
        }

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": decryptedKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify(requestBody)
        });
        if (res.ok) {
          const data = await res.json();
          const toolUseBlocks = (data.content || []).filter((b: { type: string }) => b.type === "tool_use");
          const textBlocks = (data.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n");

          if (toolUseBlocks.length > 0) {
            const formattedCalls = toolUseBlocks.map((tc: { name: string; input: Record<string, unknown> }) => ({
              name: tc.name,
              arguments: tc.input || {}
            }));
            return "```json\n" + JSON.stringify({ tool_calls: formattedCalls }, null, 2) + "\n```";
          }
          return textBlocks;
        }
        const errText = await res.text();
        throw new Error(`Anthropic API status ${res.status}: ${errText}`);
      }

      if (provider === "google" || provider === "gemini") {
        const url = prov.baseUrl || `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${decryptedKey}`;
        
        const contents: { role: string; parts: { text?: string; functionResponse?: { name: string; response: Record<string, unknown> } }[] }[] = [];
        for (const m of messages) {
          if (m.role === "tool") {
            contents.push({
              role: "user",
              parts: [{ text: `[Tool Output for ${m.name || "tool"}]: ${m.content}` }]
            });
          } else {
            contents.push({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }]
            });
          }
        }

        const geminiTools = (tools || []).map(t => {
          const tName = t.name || "";
          const tDesc = t.description || "Execute tool call.";
          const schema = t.inputSchema;
          const params: Record<string, unknown> = {
            type: "OBJECT",
            properties: {} as Record<string, unknown>,
          };
          if (schema && schema.properties) {
            params.properties = schema.properties;
          }
          if (schema && schema.required && schema.required.length > 0) {
            params.required = schema.required;
          }
          return {
            name: tName,
            description: tDesc,
            parameters: params
          };
        });

        const requestBody: Record<string, unknown> = {
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] }
        };

        if (geminiTools.length > 0) {
          requestBody.tools = [{ functionDeclarations: geminiTools }];
          if (toolChoice === "required") {
            requestBody.toolConfig = {
              functionCallingConfig: {
                mode: "ANY"
              }
            };
          }
        }

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        });
        if (res.ok) {
          const data = await res.json();
          const parts = (data.candidates?.[0]?.content?.parts || []) as { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[];
          const functionCalls = parts.filter(p => p.functionCall);
          const textParts = parts.filter(p => p.text).map(p => p.text || "").join("\n");

          if (functionCalls.length > 0) {
            const formattedCalls = functionCalls.map((fc) => ({
              name: fc.functionCall?.name || "",
              arguments: fc.functionCall?.args || {}
            }));
            return "```json\n" + JSON.stringify({ tool_calls: formattedCalls }, null, 2) + "\n```";
          }
          return textParts;
        }
        const errText = await res.text();
        throw new Error(`Gemini API status ${res.status}: ${errText}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isTransient = errMsg.includes("500") || errMsg.includes("502") || errMsg.includes("503") || errMsg.includes("429") || errMsg.includes("fetch failed");
      if (attempt < 3 && isTransient) {
        console.warn(`[LLM History Retry] Attempt ${attempt} failed for ${provider}/${modelName} (${errMsg}). Retrying in ${attempt * 1000}ms...`);
        await new Promise(r => setTimeout(r, attempt * 1000));
        continue;
      }
      console.error(`LLM Query Failure for ${provider}/${modelName} (attempt ${attempt}):`, errMsg);
    }
  }

  return `[Resilient Mock Mode] Response from ${provider}/${modelName}:\nProcessing history complete.`;
}

let mcpSchemaCacheGlobal: { cache: Record<string, Record<string, unknown>>; timestamp: number } | null = null;
const SCHEMA_CACHE_TTL_MS = 180000; // 3 minutes TTL

async function hydrateMcpSchemas(): Promise<Record<string, Record<string, unknown>>> {
  const now = Date.now();
  if (mcpSchemaCacheGlobal && (now - mcpSchemaCacheGlobal.timestamp < SCHEMA_CACHE_TTL_MS)) {
    return mcpSchemaCacheGlobal.cache;
  }
  const cache: Record<string, Record<string, unknown>> = {};
  try {
    const mcpConfigRes = await pool.query(
      'SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1'
    );
    if (mcpConfigRes.rows.length > 0 && mcpConfigRes.rows[0].designTokens) {
      const tokens = mcpConfigRes.rows[0].designTokens as Record<string, unknown>;
      const mcpServersVal = tokens.mcpServers;
      let mcpServersObj: Record<string, { serverUrl?: string; headers?: Record<string, string>; disabled?: boolean }> = {};
      if (typeof mcpServersVal === "string") {
        try { const p = JSON.parse(mcpServersVal); mcpServersObj = p.mcpServers || p; } catch {}
      } else if (mcpServersVal && typeof mcpServersVal === "object") {
        const v = mcpServersVal as Record<string, unknown>;
        mcpServersObj = (v.mcpServers as typeof mcpServersObj) || v as typeof mcpServersObj;
      }

      for (const [, serverCfg] of Object.entries(mcpServersObj)) {
        if (!serverCfg?.serverUrl || serverCfg.disabled === true) continue;
        try {
          let sseUrl = serverCfg.serverUrl;
          const isDocker = process.env.DATABASE_URL?.includes("savazai-db");
          if (isDocker && sseUrl.includes("localhost")) {
            sseUrl = sseUrl.replace("localhost", "host.docker.internal");
          }
          const listRes = await fetch(sseUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(serverCfg.headers || {})
            },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
            signal: AbortSignal.timeout(8000)
          });
          if (listRes.ok) {
            const listData = await listRes.json() as { result?: { tools?: { name: string; description?: string; inputSchema?: Record<string, unknown> }[] } };
            for (const t of listData?.result?.tools || []) {
              if (t.name && t.inputSchema) {
                cache[t.name] = t.inputSchema;
                if (t.description) {
                  cache[`__desc__${t.name}`] = { desc: t.description } as Record<string, unknown>;
                }
              }
            }
          }
        } catch { /* skip unreachable servers */ }
      }
    }
  } catch (hydrationErr) {
    console.error("[MCP Schema Hydration] Failed:", hydrationErr);
  }
  mcpSchemaCacheGlobal = { cache, timestamp: now };
  return cache;
}

// ── Shared Supervisor Plan Generation ──
async function generateSupervisorPlan(
  supervisorNode: GraphNode,
  targetNodes: GraphNode[],
  message: string,
  providerConfigs: Record<string, LLMProviderConfig>,
  parentInstruction?: string,
  threadHistory?: ChatMessage[],
  mcpSchemaCache?: Record<string, Record<string, unknown>>
): Promise<{ selectedIds: string[]; executionPlan: ExecutionPlanItem[]; planSummary?: string; clarificationPrompt?: string; outOfScopeReason?: string }> {
  const schemas = mcpSchemaCache || await hydrateMcpSchemas();

  // Fast-track: Email Forwarding ONLY if the user prompt does NOT contain active data retrieval or search requests
  const msgLower = message.toLowerCase();
  const emailMatch = message.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  const hasDataRetrievalIntent = /\b(find|search|lookup|get|list|show|fetch|query|discover|recommend|venues|decorators|vendors|caterers|photographers|guests|tasks|ceremonies|items)\b/i.test(message);
  const isEmailForward = !hasDataRetrievalIntent && emailMatch && (
    msgLower.includes("send the above") ||
    msgLower.includes("forward the above") ||
    msgLower.includes("email the above") ||
    msgLower.startsWith("send this report to") ||
    msgLower.startsWith("email this report to") ||
    msgLower.startsWith("send report to") ||
    msgLower.startsWith("forward to")
  );

  if (isEmailForward && emailMatch) {
    const toEmail = emailMatch[0];
    const planSummary = `Forward previously generated summary report from conversation history via email to ${toEmail}.`;
    const executionPlan: ExecutionPlanItem[] = [{
      nodeId: "synthesizer",
      targetNode: "Synthesizer Agent",
      actionVerb: "READ",
      allowedVerbs: ["READ", "LIST"],
      targetEntity: "Email Report",
      parameters: { to: toEmail },
      requiresClarification: false
    }];
    return { selectedIds: [], executionPlan, planSummary };
  }

  // Rich tool descriptions map for native tools
  const nativeToolDescMap: Record<string, string> = {
    "google-places": "Search for external businesses, venues, decorators, florists, and local services in a geographic city or location via Google Places (New) API with ratings, reviews, contact numbers, and maps.",
    "web-search": "Search the live web for contact details, emails, websites, and business info via Serper/Tavily.",
    "send-email": "Send automated emails to recipients.",
    "generate-pdf": "Generate structured PDF reports.",
    "generate-csv": "Generate downloadable RFC 4180 CSV spreadsheet exports.",
    "yelp-business-search": "Search for local businesses, reviews, and ratings via Yelp Fusion API."
  };

  // Compact tool descriptions to keep Supervisor input tokens small (~1k tokens)
  const targetNodeDescriptions = targetNodes.map(n => {
    const toolDetails = (n.tools || []).map(t => {
      const toolObj = typeof t === "string" ? { name: t } : t;
      const tName = toolObj?.name || String(t);
      const schema = (toolObj?.inputSchema || schemas[tName]) as McpToolInputSchema | undefined;
      const desc = toolObj?.description || nativeToolDescMap[tName] || (schemas[`__desc__${tName}`] as { desc: string })?.desc || "Execute tool call.";
      const req = (schema?.required || []).join(", ");
      return `  - Tool: "${tName}" — ${desc}${req ? ` [Required: ${req}]` : ""}`;
    }).filter(Boolean).join("\n");

    return `- Node ID: "${n.id}" | Name: "${n.label}"\n  Assigned Tools:\n${toolDetails || "  (No tools assigned)"}`;
  }).join("\n\n");

  let systemPromptContext = supervisorNode.systemPrompt || "Perform the assigned task.";
  if (supervisorNode.skills) {
    systemPromptContext += `\n\nBound Skills Context:\n${typeof supervisorNode.skills === "object" ? JSON.stringify(supervisorNode.skills) : String(supervisorNode.skills)}`;
  }
  if (supervisorNode.knowledge) {
    systemPromptContext += `\n\nBound Knowledge Context:\n${typeof supervisorNode.knowledge === "object" ? JSON.stringify(supervisorNode.knowledge) : String(supervisorNode.knowledge)}`;
  }
  if (threadHistory && threadHistory.length > 0) {
    const historyText = threadHistory.slice(-4).map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 200)}`).join("\n");
    systemPromptContext += `\n\nPREVIOUS CONVERSATION HISTORY:\n${historyText}`;
  }

  const supervisorPrompt = `${systemPromptContext}

You are a Supervisor/Routing Agent. Your task is to analyze the user request against the explicit Downstream Worker Nodes and their Assigned Tools below.

CLASSIFICATION & ROUTING RULES:
1. EXTERNAL SEARCH & GEOGRAPHIC DISCOVERY VS INTERNAL DATABASE:
   - When the user asks to find, search, or discover external businesses, services, vendors, decorators, venues, caterers, etc. in a geographic city/region/location (e.g. "in Secunderabad, India", "in Tirupati", "in Chicago"):
     * Select ONLY the worker node equipped with external search tools (e.g. "google-places", "web-search").
     * DO NOT select internal database worker nodes (like "list_vendors", "list_guests", "list_ceremonies", "list_tasks", "get_wedding") for external geographic business discovery queries!
   - When the user asks to view, list, create, update, or delete existing workspace database records (e.g. "show our guests", "add a task", "update vendor budget"):
     * Select the corresponding internal database worker node.
2. CONVERSATIONAL & CAPABILITY INQUIRIES:
   - If the user request is a greeting ("Hi", "Hello") or capability inquiry ("What can you do?"):
   - Return \`"selectedNodeIds": []\` and \`"executionPlan": []\`.
   - Set \`"planSummary": "Direct Response: Answer greeting and explain workspace capabilities."\`
3. OUT-OF-SCOPE INQUIRIES:
   - ONLY flag out-of-scope if the user request asks for something completely unrelated to any available downstream worker tools.
   - If ANY downstream worker node tools match the request, DO NOT set outOfScopeReason and DO NOT output out-of-scope messages! Formulate a step-by-step execution plan for the target nodes.
4. CRITICAL PARAMETER DUE DILIGENCE & CLARIFICATION RULES:
   - For any action (CREATE, ADD, UPDATE, DELETE) across ANY entity type managed by the downstream worker tools:
     * Compare the user prompt against the Required Fields array of the target tool's schema.
     * If the user explicitly asks what information is needed (e.g. "what are the details you need?"), OR if mandatory required primary human domain parameters (name, title, email, date, etc.) are missing from the user request or conversation history:
       1. Set \`"requiresClarification": true\` on that step.
       2. Set \`"actionVerb": "CLARIFY"\`.
       3. Formulate a specific, helpful, professional \`"clarificationPrompt"\` listing each missing required parameter with its description and examples.
   - NO FABRICATION MANDATE: NEVER invent, guess, or fabricate fake placeholder values (e.g. "New Item", "example@email.com", "Dummy Record"). If required fields are missing, set \`"requiresClarification": true\`.
   - NO SYSTEM/FOREIGN-KEY WARNINGS: Primary record identifiers ("id") and foreign keys ending with "Id" are system UUIDs that are resolved automatically by downstream worker list tools — DO NOT flag system IDs or UUIDs as missing parameters from the user! NEVER ask the user to provide an "ID", "UUID", "id", or system key!
5. MANDATORY MULTI-STEP COMPOUND REQUEST DECOMPOSITION:
   - When a user prompt combines data retrieval or discovery with downstream actions (e.g. finding places/vendors/records AND generating a downloadable CSV/PDF file AND/OR sending an email report):
     * Step 1 (Data Retrieval): Select the relevant search/retrieval worker node (e.g. Web & Places Specialist Agent) with actionVerb "LIST" or "READ" to fetch real data. Extract the exact search query and location into parameters: { "query": "<search query and location from user prompt e.g. wedding caterers in Tirupati, India>" }.
     * Step 2 (Downstream Actions & Export): The downstream file export (CSV/PDF) and email dispatch will be handled by the specialized action/synthesizer tools. Do NOT add unnecessary worker nodes that have no relevant tools for the request.
   - Only select worker nodes whose tools are directly relevant to the user request. NEVER select unrelated worker nodes!
   - NEVER skip data retrieval worker nodes when the user query asks to find, search, list, or discover items!
   - NEVER return empty selectedNodeIds or route directly to Synthesizer Agent alone if data retrieval or tool execution is needed!

Available Downstream Worker Nodes & Tools:
${targetNodeDescriptions}

You MUST return your decision as a valid JSON object matching the following structure:
{
  "selectedNodeIds": ["node-id-1"],
  "planSummary": "High-level step-by-step implementation strategy describing what data will be fetched or actions taken.",
  "outOfScopeReason": "",
  "clarificationPrompt": "To complete this action, please provide:\n1. **Field 1** (required)\n2. **Field 2** (required)",
  "executionPlan": [
    {
      "nodeId": "node-id-1",
      "targetNode": "Worker Node Name",
      "actionVerb": "CREATE",
      "allowedVerbs": ["CREATE"],
      "targetEntity": "Entity Name",
      "parameters": {},
      "requiresClarification": true,
      "warning": "Missing required fields",
      "clarificationPrompt": "Please provide Field 1 and Field 2."
    }
  ]
}

Return ONLY the JSON object, no extra commentary, no markdown backticks, no text.`;

  const supervisorResponse = await queryLLMDirectly(
    supervisorNode.modelConfig.provider,
    supervisorNode.modelConfig.model,
    supervisorPrompt,
    parentInstruction
      ? `Context/Instructions: "${parentInstruction}"\nOriginal user request: "${message}"\nFormulate a plan summary and determine downstream steps.`
      : `Context/Instructions: "Analyze the request, formulate plan summary, and check missing details"\nOriginal user request: "${message}"\nFormulate a plan summary and determine downstream steps.`,
    providerConfigs
  );

  let selectedIds: string[] = [];
  let executionPlan: ExecutionPlanItem[] = [];
  let planSummary: string | undefined;
  let clarificationPrompt: string | undefined;
  let outOfScopeReason: string | undefined;

  try {
    const cleaned = supervisorResponse.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    selectedIds = parsed.selectedNodeIds || [];
    executionPlan = parsed.executionPlan || [];
    planSummary = parsed.planSummary || undefined;
    clarificationPrompt = parsed.clarificationPrompt || undefined;
    outOfScopeReason = parsed.outOfScopeReason || undefined;

    // Post-process to remove CREATE locks for read-only queries
    if (isReadOnlyQuery(message)) {
      executionPlan = executionPlan.filter((item: ExecutionPlanItem) => {
        const verb = String(item.actionVerb || item.allowedVerbs?.[0] || "").toUpperCase();
        const nodeId = String(item.nodeId || "").toLowerCase();
        if (verb === "CREATE" || verb === "UPDATE" || verb === "DELETE") return false;
        if (nodeId.includes("create") || nodeId.includes("update") || nodeId.includes("delete")) return false;
        return true;
      });
      for (const item of executionPlan) {
        item.actionVerb = "LIST";
        item.allowedVerbs = ["LIST", "READ"];
      }
    }

    // Auto-populate query parameter for discovery/search worker nodes if missing or empty
    for (const item of executionPlan) {
      if (!item.parameters) item.parameters = {};
      if (!item.parameters.query && !item.parameters.textQuery && !item.parameters.search_query) {
        const targetN = typedNodes.find(n => n.id === item.nodeId);
        const hasSearchTool = targetN?.tools?.some(t => {
          const tn = (typeof t === "string" ? t : (t as AgentflowTool)?.name || "").toLowerCase();
          return tn.includes("places") || tn.includes("search") || tn.includes("yelp");
        });
        if (hasSearchTool) {
          item.parameters.query = message;
          item.parameters.textQuery = message;
        }
      }
    }
  } catch {
    selectedIds = targetNodes
      .filter(n => supervisorResponse.includes(n.id))
      .map(n => n.id);
  }

function buildClarificationFromSchema(
  targetNode: GraphNode,
  schemas: Record<string, unknown>,
  intent: "UPDATE" | "CREATE" | "DELETE" | "LIST" = "CREATE"
): string {
  const tools = targetNode.tools || [];
  const mutateTool = tools.map(t => typeof t === "string" ? { name: t } : t).find(t => {
    const n = (t?.name || "").toLowerCase();
    if (intent === "DELETE") {
      return n.includes("delete") || n.includes("remove") || n.includes("cancel") || n.includes("destroy") || n.includes("drop");
    } else if (intent === "UPDATE") {
      return n.includes("update") || n.includes("edit") || n.includes("modify") || n.includes("set");
    }
    return n.includes("create") || n.includes("add") || n.includes("insert") || n.includes("new");
  }) || tools.map(t => typeof t === "string" ? { name: t } : t).find(t => {
    const n = (t?.name || "").toLowerCase();
    return n.includes("create") || n.includes("add") || n.includes("update") || n.includes("delete") || n.includes("insert") || n.includes("new");
  });

  const toolObj = mutateTool || (tools[0] ? (typeof tools[0] === "string" ? { name: tools[0] } : tools[0]) : null);
  const entityName = targetNode.label.replace(/Worker|Agent/gi, "").trim();
  const tName = toolObj?.name || "";
  const rawSchema = toolObj?.inputSchema || (tName ? schemas[tName] : null);
  const schema = rawSchema as McpToolInputSchema | undefined;

  const reqFields = schema?.required || [];
  const props = schema?.properties || {};

  // Hide primary internal system/scope keys (id, _id, workspaceId, tenantId, organizationId, scopeId, etc.)
  const isPrimaryScopeSystemId = (k: string) => {
    if (k === "id" || k === "_id") return true;
    const lower = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    return lower.endsWith("id") && (
      lower.includes("tenant") ||
      lower.includes("workspace") ||
      lower.includes("organization") ||
      lower.includes("scope") ||
      lower.includes("app") ||
      lower.includes("wedding") ||
      lower.includes("project")
    );
  };

  const fieldsList = Object.keys(props)
    .filter(k => !isPrimaryScopeSystemId(k))
    .map(k => {
      const p = props[k];
      const isReq = reqFields.includes(k);
      const rawDesc = p?.description || "";
      const cleanDesc = rawDesc.replace(/ISO\s*8601|ISO\s*string/gi, "e.g. Sep 26, 2026 at 11:00 AM or 2026-09-26");
      const desc = cleanDesc ? ` (${cleanDesc})` : "";

      // Clean technical Id suffix for display (e.g. ceremonyId -> Ceremony, assignedUserId -> Assigned User)
      const cleanKey = k.replace(/_id$/i, "").replace(/Id$/i, "");
      const formattedName = cleanKey
        .replace(/_/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, c => c.toUpperCase());

      let enumStr = "";
      const pRecord = p as unknown as Record<string, unknown> | undefined;
      if (Array.isArray(pRecord?.enum) && (pRecord.enum as unknown[]).length > 0) {
        enumStr = ` [Keep one: ${(pRecord.enum as unknown[]).map(String).join(" / ")}]`;
      } else if (Array.isArray(pRecord?.examples) && (pRecord.examples as unknown[]).length > 0) {
        enumStr = ` [Keep one: ${(pRecord.examples as unknown[]).map(String).join(" / ")}]`;
      } else if (pRecord?.type === "boolean") {
        enumStr = ` [Keep one: true / false]`;
      } else if (pRecord?.type === "array" || pRecord?.items) {
        enumStr = ` [Comma-separated list, or type "all"]`;
      } else if (typeof pRecord?.description === "string" && pRecord.description.includes("e.g.")) {
        const match = (pRecord.description as string).match(/e\.g\.\s*([^)]+)/i);
        if (match) {
          enumStr = ` [e.g. ${match[1].trim()}]`;
        }
      } else if (/Id$|_id$/i.test(k)) {
        enumStr = ` [e.g. Name or leave blank]`;
      }

      return `• ${formattedName}${isReq ? " [REQUIRED]" : " [OPTIONAL]"}${enumStr}${desc}`;
    });

  if (fieldsList.length > 0) {
    return `To complete your request for ${entityName}, please provide the following details:\n\n${fieldsList.join("\n")}\n\nType your details in the box below and click "Submit Details & Execute Plan".`;
  }

  return `To complete your request for ${entityName}, please enter the details in the box below to execute.`;
}

  const isUpdateIntent = /\b(update|modify|change|edit|set|adjust|rename)\b/i.test(message);
  const isCreateIntent = /\b(create|add|new|insert|invite)\b/i.test(message);
  const isDeleteIntent = /\b(delete|remove|cancel|destroy|drop|erase|clear)\b/i.test(message);

  // Auto-generate detailed schema parameter checklist for write operations if missing.
  const KEY_VALUE_RE = /^[A-Za-z0-9 _]+:\s*\S/m;
  const hasNaturalUpdateDetails = isUpdateIntent && (
    /\bto\b|\bfor\b|\bset\b|\bas\b/i.test(message) ||
    /\d+/.test(message) ||
    KEY_VALUE_RE.test(message)
  );
  const hasNaturalDeleteDetails = isDeleteIntent;

  const hasProvidedDetails =
    hasNaturalUpdateDetails ||
    hasNaturalDeleteDetails ||
    KEY_VALUE_RE.test(message) ||
    message.includes("[USER PROVIDED") ||
    message.includes("Submit Details");

  const isWriteIntent = isCreateIntent || isUpdateIntent || isDeleteIntent;
  if (!isReadOnlyQuery(message) && targetNodes.length > 0 && !hasProvidedDetails && isWriteIntent) {
    const primaryTargetNode = selectedIds.length > 0 ? (targetNodes.find(n => n.id === selectedIds[0]) || targetNodes[0]) : targetNodes[0];
    const targetIntent = isDeleteIntent ? "DELETE" : (isUpdateIntent ? "UPDATE" : "CREATE");
    clarificationPrompt = buildClarificationFromSchema(primaryTargetNode, schemas, targetIntent);
    if (selectedIds.length === 0) {
      selectedIds = [primaryTargetNode.id];
    }
  } else if (hasProvidedDetails) {
    clarificationPrompt = undefined;
  }

  // Guardrail: Delete & Update intents NEVER require clarification for system IDs, because target entity names are automatically resolved by autoResolveMissingSystemIds!
  if (isDeleteIntent || isUpdateIntent) {
    clarificationPrompt = undefined;
  } else if (clarificationPrompt && (
    /\b(provide|enter|need|specify|give|obtain)\s+(the\s+)?(id|uuid|guid|identifier|primary\s+key|system\s+id)\b/i.test(clarificationPrompt) ||
    /unique\s+identifier|unique\s+id/i.test(clarificationPrompt) ||
    /•\s+Id\b/i.test(clarificationPrompt)
  )) {
    console.log("[Supervisor Post-Proc] Stripped invalid clarification prompt asking for system ID:", clarificationPrompt);
    clarificationPrompt = undefined;
  }

  if (executionPlan.length === 0 && (selectedIds.length > 0 || clarificationPrompt)) {
    const isRead = isReadOnlyQuery(message);
    const targetNodeList = selectedIds.length > 0
      ? targetNodes.filter(n => selectedIds.includes(n.id))
      : (targetNodes.length > 0 ? [targetNodes[0]] : []);
    executionPlan = targetNodeList.map(n => {
      const calculatedVerb = clarificationPrompt
        ? "CLARIFY"
        : (isRead ? "LIST" : (isDeleteIntent ? "DELETE" : (isUpdateIntent ? "UPDATE" : "CREATE")));
      const allowed = clarificationPrompt
        ? ["CLARIFY", isDeleteIntent ? "DELETE" : (isUpdateIntent ? "UPDATE" : "CREATE")]
        : (isRead ? ["LIST", "READ"] : (isDeleteIntent ? ["DELETE", "READ", "LIST"] : (isUpdateIntent ? ["UPDATE", "READ"] : ["CREATE", "READ"])));
      return {
        nodeId: n.id,
        targetNode: n.label || "Worker",
        actionVerb: calculatedVerb,
        allowedVerbs: allowed,
        targetEntity: n.label || "Entity",
        parameters: {},
        requiresClarification: !!clarificationPrompt,
        clarificationPrompt
      } as ExecutionPlanItem;
    });
  }

  // Architectural Rule: Whenever an execution plan contains 1 or more active steps,
  // the plan summary is ALWAYS synthesized directly from the graph topology of the execution plan.
  if (executionPlan.length > 0) {
    const quotedItems = Array.from(message.matchAll(/["']([^"']+)["']/g)).map(m => m[1]);
    const targetsStr = quotedItems.length > 0 ? `Target item(s): "${quotedItems.join('", "')}"` : "Scope: All active workspace records";
    
    const stepsText = executionPlan.map((p, i) => {
      const verb = (p.actionVerb || "EXECUTE").toUpperCase();
      const entity = p.targetEntity || p.targetNode.replace(/Worker|Agent/gi, "").trim();
      let friendlyAction = "";
      if (verb === "LIST" || verb === "READ") {
        friendlyAction = `Fetch and analyze ${entity} records`;
      } else if (verb === "CREATE" || verb === "ADD") {
        friendlyAction = `Add new ${entity} entry`;
      } else if (verb === "UPDATE") {
        friendlyAction = `Modify ${entity} information`;
      } else if (verb === "DELETE" || verb === "REMOVE") {
        friendlyAction = `Remove ${entity} record`;
      } else {
        friendlyAction = `Execute ${verb} operation on ${entity}`;
      }

      return `**Step ${i + 1}: ${p.targetNode}**\n• **Action**: ${friendlyAction}\n• **Coverage**: ${targetsStr}`;
    }).join("\n\n");

    const isReport = message.toLowerCase().includes("report") || message.toLowerCase().includes("summary") || message.toLowerCase().includes("recommend");
    const synthAction = isReport
      ? "Synthesizer Agent will analyze all retrieved records, compute key metrics, and provide an executive report with recommendations."
      : "Synthesizer Agent will process the execution results and confirm completed actions.";

    planSummary = `### 📋 Proposed Execution Plan\n\n${stepsText}\n\n💡 **Outcome Strategy**: ${synthAction}`;
  }

  // Normalize: ensure allowedVerbs is populated and actionVerb is backward-compatible
  for (const plan of executionPlan) {
    if (!plan.allowedVerbs || plan.allowedVerbs.length === 0) {
      const defaultVerb = isDeleteIntent ? "DELETE" : (isUpdateIntent ? "UPDATE" : "CREATE");
      plan.allowedVerbs = [plan.actionVerb || defaultVerb];
    }
    if (!plan.actionVerb) {
      plan.actionVerb = plan.allowedVerbs[0] || (isDeleteIntent ? "DELETE" : (isUpdateIntent ? "UPDATE" : "CREATE"));
    }
    if (plan.requiresClarification && !clarificationPrompt && plan.clarificationPrompt) {
      clarificationPrompt = plan.clarificationPrompt;
    }
  }

  return { selectedIds, executionPlan, planSummary, clarificationPrompt, outOfScopeReason };
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  
  try {
    const body = await req.json();
    const { nodes, edges, approvedPlan, threadId, executionMode } = body;
    let { message } = body as { message: string };
    const execThreadId = threadId || crypto.randomUUID();

    if (!message || message === "null") {
      const existingHistory = await loadThreadMemory(execThreadId);
      const lastUserMsg = [...existingHistory].reverse().find(m => m.role === "user");
      if (lastUserMsg && lastUserMsg.content) {
        message = lastUserMsg.content;
      }
    }

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return new Response(JSON.stringify({ error: "Missing nodes array" }), { status: 400 });
    }

    const hitlNodes = (nodes as GraphNode[]);
    const hitlSupervisorNode = hitlNodes.find(n => n.label === "Supervisor Agent" || n.roleTemplate === "supervisor") || hitlNodes[0];

    // Fast-track: Initial Welcome Greeting for Test Playground
    if (message === "WELCOME_INIT" || body.mode === "welcome") {
      const targetNodes = hitlNodes.filter(n => n.roleTemplate !== "supervisor" && n.roleTemplate !== "synthesizer");
      const workerListText = targetNodes.map(n => `- **${n.label}**: ${n.systemPrompt ? n.systemPrompt.slice(0, 140) : "Handles domain operations."}`).join("\n");
      const supervisorName = hitlSupervisorNode?.label || "Supervisor Agent";
      const welcomeText = `Hello! I am the **${supervisorName}**. I coordinate all activities across this agent graph to assist you.\n\nI can help you with:\n${workerListText}\n\nWhat would you like to do today?`;
      return new Response(JSON.stringify({ status: "WELCOME", message: welcomeText }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    
    let shouldPause = false;
    if (executionMode === "direct") {
      shouldPause = false;
    } else if (executionMode === "plan_first") {
      shouldPause = true;
    } else {
      const hitlPolicy = hitlSupervisorNode?.hitlPolicy || hitlSupervisorNode?.data?.guardrails?.hitlPolicy;
      const nodeExecutionMode = (hitlSupervisorNode?.data as Record<string, unknown> | undefined)?.executionMode as string | undefined;
      if (nodeExecutionMode === "direct") {
        shouldPause = false;
      } else if (nodeExecutionMode === "plan_first") {
        shouldPause = true;
      } else {
        shouldPause = hitlPolicy === "always" || hitlPolicy === "on_mutation";
      }
    }

    if (!approvedPlan && shouldPause) {
      const outgoingEdges = (edges as { source: string; target: string }[]).filter(e => e.source === hitlSupervisorNode.id);
      const targetNodes = outgoingEdges
        .map(e => hitlNodes.find(n => n.id === e.target))
        .filter((n): n is GraphNode => !!n && n.roleTemplate !== "synthesizer");

      // Resolve provider credentials needed for plan generation
      const configRes = await pool.query(
        'SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1'
      );
      let hitlProviderConfigs: Record<string, LLMProviderConfig> = {};
      if (configRes.rows.length > 0 && configRes.rows[0].designTokens) {
        const tokens = configRes.rows[0].designTokens;
        hitlProviderConfigs = tokens.llmProviders || {};
      }

      let executionPlan: ExecutionPlanItem[] = [];
      let planSummary: string | undefined;
      let clarificationPrompt: string | undefined;
      if (targetNodes.length > 0) {
        const hitlHistory = execThreadId ? await loadThreadMemory(execThreadId) : [];
        const planResult = await generateSupervisorPlan(
          hitlSupervisorNode, targetNodes, message, hitlProviderConfigs, undefined, hitlHistory
        );
        executionPlan = planResult.executionPlan;
        planSummary = planResult.planSummary;
        clarificationPrompt = planResult.clarificationPrompt;
      }

      if (executionPlan.length > 0 || clarificationPrompt) {
        return new Response(
          JSON.stringify({
            status: "PAUSED_AWAITING_HUMAN_APPROVAL",
            executionPlan,
            planSummary: planSummary || null,
            clarificationPrompt: clarificationPrompt || null,
            message: clarificationPrompt
              ? clarificationPrompt
              : "Execution paused for human approval at Supervisor Agent."
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }

    // ── NON-HITL PATH: Resolve Provider Credentials & Design Tokens ──
    const configRes = await pool.query(
      'SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1'
    );
    let providerConfigs: Record<string, LLMProviderConfig> = {};
    const designTokens: Record<string, unknown> = {};
    if (configRes.rows.length > 0 && configRes.rows[0].designTokens) {
      const tokens = configRes.rows[0].designTokens;
      providerConfigs = tokens.llmProviders || {};
      Object.assign(designTokens, tokens);
    }

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
        // 1. Identify graph nodes
        const typedNodes = nodes as GraphNode[];
        const typedEdges = edges as { source: string; target: string }[];

        const supervisorNode = typedNodes.find(n => n.roleTemplate === "supervisor") || typedNodes[0];
        const synthesizerNode = typedNodes.find(n => n.roleTemplate === "synthesizer");

        const workerResults: { nodeLabel: string; output: string; receipts: ToolExecutionReceipt[] }[] = [];
        const visitedNodes = new Set<string>();
        const sharedContextMessages: ChatMessage[] = [];
        const globalMcpSchemaCache: Record<string, Record<string, unknown>> = {};
        let globalSelectedIds: string[] = [];
        const threadHistory = execThreadId ? await loadThreadMemory(execThreadId) : [];
        if (threadHistory.length > 0) {
          sendEvent({ type: "trace", content: `[Thread Memory] Loaded ${threadHistory.length} previous conversation messages for multi-turn thread context.` });
        }

        // Pre-load compliance rules for PII masking engine
        const complianceConfig = await loadComplianceRules();

        async function runAgentNode(
          nodeId: string,
          parentInstruction: string,
          contextSnapshot?: ChatMessage[]
        ): Promise<string> {
          const parentContext = contextSnapshot || sharedContextMessages;
          if (visitedNodes.has(nodeId)) {
            return "";
          }
          visitedNodes.add(nodeId);

          const node = typedNodes.find(n => n.id === nodeId);
          if (!node) {
            return `[Error] Node with ID ${nodeId} not found in the agentflow graph.`;
          }

          // Build System Prompt with Context Injection (Pillar: Knowledge & RAG)
          let systemPromptContext = node.systemPrompt || "Perform the assigned task.";
          if (node.skills) {
            systemPromptContext += `\n\nBound Skills Context:\n${typeof node.skills === "object" ? JSON.stringify(node.skills) : String(node.skills)}`;
          }
          if (node.knowledge) {
            systemPromptContext += `\n\nBound Knowledge Context:\n${typeof node.knowledge === "object" ? JSON.stringify(node.knowledge) : String(node.knowledge)}`;
          }
          // RAG namespace context injection
          const ragNs = (node as GraphNode).ragNamespace;
          const embedModel = (node as GraphNode).embedModel;
          if (ragNs) {
            const ragChunks = await queryRagContext(ragNs, embedModel);
            if (ragChunks) {
              systemPromptContext += `\n\nRAG Knowledge Context (namespace: "${ragNs}"):\n${ragChunks}`;
              sendEvent({ type: "trace", content: `[Knowledge: ${node.label}] Injected ${ragChunks.length} RAG chunks from namespace "${ragNs}"` });
            }
          }
          // OKF organizational facts injection (always injected if available)
          const okfFacts = await queryOkfFacts();
          if (okfFacts) {
            systemPromptContext += `\n\nOrganizational Knowledge Facts:\n${okfFacts}`;
          }

          // Inject Zero-Fabrication Enforcement for worker nodes
          systemPromptContext += `\n\nCRITICAL ZERO-FABRICATION MANDATE:
- You MUST NOT invent, guess, or fabricate fake placeholder values (e.g. 'New Item', 'example@email.com', '000-000-0000', 'Sample Record') for any mutating tool calls (create, update, delete, add, insert, modify).
- If mandatory required parameters declared in the tool schema were not explicitly provided in the user prompt or conversation history, DO NOT execute the mutating tool call. Return a notice: "[STATUS: MISSING_PARAMETERS] Cannot execute tool action because mandatory parameters are missing. Please prompt the user for the required details."`;

          const role = node.roleTemplate || "worker";

          // ── Phase 7: Role-Based Tool Enforcement ──
          // Supervisor: strip all tools to enforce planning-only behavior (zero mutation tools)
          if (role === "supervisor" || role === "planner") {
            node.tools = [];
          }
          // Synthesizer: filter to non-mutation / formatting tools only
          if (role === "synthesizer" && node.tools) {
            node.tools = node.tools.filter(t => {
              const n = (t.name || "").toLowerCase();
              const blocked = ["create", "delete", "update", "remove", "insert", "destroy", "modify"];
              return !blocked.some(b => n.includes(b));
            });
          }
          if ((role === "action" || role === "notification") && node.tools) {
            node.tools = node.tools.filter(t => {
              const n = (t.name || "").toLowerCase();
              return n.includes("send") || n.includes("notify") || n.includes("dispatch") || n.includes("message") || n.includes("email") || n.includes("sms");
            });
          }

          if (role === "supervisor") {
            // Coordinator Node (Supervisor or Sub-Supervisor)
            sendEvent({ type: "trace", content: `[Graph Traversal] Supervisor node active: ${node.label || node.id}. Evaluating routing conditions...` });
            
            // Get downstream connected nodes from outgoing edges (excluding synthesizers)
            const outgoingEdges = typedEdges.filter(e => e.source === nodeId);
            const targetNodes = outgoingEdges
              .map(e => typedNodes.find(n => n.id === e.target))
              .filter((n): n is GraphNode => !!n && n.roleTemplate !== "synthesizer");

            if (targetNodes.length === 0) {
              return "";
            }

            let selectedIds: string[] = [];
            let executionPlan: ExecutionPlanItem[] = [];

            if (approvedPlan) {
              if (Array.isArray(approvedPlan) && approvedPlan.length > 0) {
                sendEvent({ type: "trace", content: `[Graph Exec: Supervisor Node] Resuming with approved execution plan: ${JSON.stringify(approvedPlan)}` });
                executionPlan = approvedPlan;
                selectedIds = approvedPlan.map(item => item.nodeId);
              } else {
                sendEvent({ type: "trace", content: `[Graph Exec: Supervisor Node] Resuming execution (plan approved).` });
                selectedIds = targetNodes.map(n => n.id);
                const isRead = isReadOnlyQuery(message);
                executionPlan = selectedIds.map(id => {
                  const n = targetNodes.find(node => node.id === id);
                  return {
                    nodeId: id,
                    targetNode: n?.label || "Worker",
                    actionVerb: isRead ? "LIST" : "CREATE",
                    allowedVerbs: isRead ? ["LIST", "READ"] : ["CREATE"],
                    targetEntity: n?.label || "Entity",
                    parameters: {}
                  } as ExecutionPlanItem;
                });
              }
              globalSelectedIds = Array.from(new Set([...globalSelectedIds, ...selectedIds]));
            } else {
              const planResult = await generateSupervisorPlan(
                node, targetNodes, message || "", providerConfigs, parentInstruction, threadHistory
              );
              selectedIds = planResult.selectedIds;
              globalSelectedIds = Array.from(new Set([...globalSelectedIds, ...selectedIds]));
              executionPlan = planResult.executionPlan;

              if (!selectedIds || selectedIds.length === 0) {
                const activeCaps = typedNodes.filter(n => n.roleTemplate === "worker").map(n => n.label).join(", ");
                sendEvent({ type: "trace", content: `[Supervisor Direct Response] Generating direct conversational response using System Prompt, Skills, and OKF...` });

                const directPrompt = `${systemPromptContext}

USER PROMPT: "${message}"

INSTRUCTIONS FOR DIRECT RESPONSE:
- You are responding directly to the user without invoking any downstream worker database tools.
- DOMAIN SCOPE STRICTNESS MANDATE: You MUST stay strictly within your configured domain scope (defined by your System Prompt, Bound Skills, Knowledge, and Workspace Capabilities: [${activeCaps || "None"}]).
- GREETINGS & IDENTITY: If the user greeted you or asked who you are ("Who are you?", "What can you help with?"), introduce yourself warmly according to your System Prompt and list your active workspace capabilities [${activeCaps || "General Workspace Assistants"}].
- OUT-OF-SCOPE ENFORCEMENT: If the user asked a question completely unrelated to your domain scope (e.g., non-domain general knowledge, recipes, quantum physics), politely inform the user that you are specialized strictly in your domain scope and can only assist with workspace capabilities [${activeCaps || "configured workspace tasks"}]. Do NOT attempt to answer non-domain questions outside your scope.`;

                const directReply = await queryLLMDirectly(
                  node.modelConfig?.provider || "openai",
                  node.modelConfig?.model || "gpt-4o-mini",
                  directPrompt,
                  `Respond directly and politely adhere strictly to domain scope.`,
                  providerConfigs
                );

                sendEvent({ content: directReply });
                sendEvent({ type: "done" });
                return directReply;
              }

              // HITL approval gate check for sub-supervisor nodes
              const policy = (node as GraphNode).hitlPolicy || node.data?.guardrails?.hitlPolicy;
              if (policy === "always" || policy === "on_mutation") {
                sendEvent({
                  type: "trace",
                  content: `[HITL Guardrail Gate] Execution Plan generated by Supervisor Node "${node.label}" requires sign-off (policy: "${policy}"). Pausing execution.`
                });
                sendEvent({
                  type: "hitl",
                  state: "PAUSED_AWAITING_HUMAN_APPROVAL",
                  executionState: "PAUSED_AWAITING_HUMAN_APPROVAL",
                  executionPlan: executionPlan
                });
                return `[HITL Intercepted] Execution plan paused: ${JSON.stringify(executionPlan)}`;
              }
            }

            // Topological Node Execution of chosen downstream nodes
            let sortedSelectedIds = topologicalSort(selectedIds, typedEdges);

            // Ensure nodes with native side-effect tools (e.g. email) execute last
            const sideEffectNodes: string[] = [];
            const standardNodes: string[] = [];
            for (const id of sortedSelectedIds) {
              const n = typedNodes.find(node => node.id === id);
              const hasNativeTool = n && n.tools && n.tools.some(t => t.category === "native");
              if (hasNativeTool) {
                sideEffectNodes.push(id);
              } else {
                standardNodes.push(id);
              }
            }
            sortedSelectedIds = [...standardNodes, ...sideEffectNodes];

            // Traverse the edges and execute children (isolated context snapshots per branch)
            const contextBranch = [...sharedContextMessages];
            const childOutputs: string[] = [];
             for (const childId of sortedSelectedIds) {
              const childNode = typedNodes.find(n => n.id === childId);
              if (childNode) {
                sendEvent({ type: "trace", content: `[Graph Traversal] Supervisor dispatching to child: ${childNode.label}` });
                const nodePlan = executionPlan.find((p: ExecutionPlanItem) => p.nodeId === childId) || { actionVerb: "READ", allowedVerbs: ["READ", "LIST"], targetEntity: childNode.label, parameters: {} };
                const queryParam = nodePlan.parameters?.query || nodePlan.parameters?.search_query || nodePlan.parameters?.textQuery || message;
                if (!nodePlan.parameters) nodePlan.parameters = {};
                if (!nodePlan.parameters.query && !nodePlan.parameters.textQuery) {
                  nodePlan.parameters.query = queryParam;
                  nodePlan.parameters.textQuery = queryParam;
                }
                const taskInstruction = `CURRENT USER REQUEST: "${message}"\n\nSUPERVISOR PLAN FOR WORKER "${childNode.label}":\n- Action: ${nodePlan.actionVerb || "LIST"}\n- Target Entity: ${nodePlan.targetEntity || childNode.label}\n- Search Query / Keywords: "${queryParam}"\n- Parameters: ${JSON.stringify(nodePlan.parameters)}\n\nInstruction: Execute your assigned tools to discover or manage records for this request.`;
                // Each child gets a fresh clone of the pre-dispatch context — sibling outputs stay isolated
                let output = "";
                try {
                  output = await runAgentNode(childId, taskInstruction, [...contextBranch]);
                } catch (childErr) {
                  const errMsg = childErr instanceof Error ? childErr.message : String(childErr);
                  sendEvent({ type: "trace", content: `[Worker Failure: ${childNode.label}] Unhandled error: ${errMsg}` });
                  output = `[STATUS: FAILED] Node ${childNode.label} failed with error: ${errMsg}`;
                }
                if (output && output.includes("[HITL Intercepted]")) {
                  sendEvent({ type: "trace", content: `[Worker HITL: ${childNode.label}] Execution paused for approval. Continuing to next sibling.` });
                  childOutputs.push(`--- [Agent: ${childNode.label}] ---\n[STATUS: PENDING_APPROVAL] HITL guardrail paused execution.`);
                  continue;
                }
                childOutputs.push(`--- [Agent: ${childNode.label}] ---\n${output}`);
                if (output) {
                  contextBranch.push({
                    role: "assistant",
                    content: `[Worker Output: ${childNode.label}]\n${output}`
                  });
                  sharedContextMessages.push({
                    role: "assistant",
                    content: `[Worker Output: ${childNode.label}]\n${output}`
                  });
                }
              }
            }

            return childOutputs.join("\n\n");
          } else if (role === "hitl_gate") {
            // HITL Gate: intercept execution flow and pause for human approval
            sendEvent({ type: "trace", content: `[HITL Gate] Node "${node.label}" intercepting execution flow for human approval.` });
            sendEvent({
              type: "hitl",
              state: "PENDING_APPROVAL",
              executionState: "PENDING_APPROVAL",
              nodeId: nodeId,
              nodeLabel: node.label
            });
            return `[HITL Intercepted] HITL Gate node "${node.label}" paused execution for approval.`;
          } else if (role === "worker") {
            // Leaf Worker Node
            sendEvent({ type: "trace", content: `[Worker Exec] ${node.label} initializing tool loop...` });
            if (!node.tools || node.tools.length === 0) {
              sendEvent({
                type: "trace",
                content: `[Orchestrator Setup Warning: Node "${node.label}" (${node.id}) has 0 assigned tools]`
              });
            }

function parseParametersFromText(text: string, schemaProps?: Record<string, unknown>): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (!text || typeof text !== "string") return params;

  const propKeys = schemaProps ? Object.keys(schemaProps) : [];

  // Split text by newlines OR key-colon boundaries (e.g. "Name: Satya Tiffins Category: Catering")
  const segments = text
    .split(/\n|(?=\b[A-Za-z0-9_]+\s*:)/)
    .map(s => s.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const colonIdx = segment.indexOf(":");
    if (colonIdx === -1) continue;
    const keyRaw = segment.slice(0, colonIdx).replace(/^[\s•\-0-9.]+\s*/, "").replace(/\*/g, "").trim();
    const valRaw = segment.slice(colonIdx + 1).trim();
    if (!keyRaw || !valRaw) continue;

    const normalizedRaw = keyRaw.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Direct fuzzy schema property matching with stem matching (e.g. Ceremony -> ceremonyId)
    let matchedPropKey: string | null = null;
    if (propKeys.length > 0) {
      for (const pk of propKeys) {
        const normalizedPk = pk.toLowerCase().replace(/[^a-z0-9]/g, "");
        const stemPk = normalizedPk.replace(/id$/, "");
        const stemRaw = normalizedRaw.replace(/id$/, "");
        if (
          normalizedRaw === normalizedPk ||
          normalizedRaw.includes(normalizedPk) ||
          normalizedPk.includes(normalizedRaw) ||
          (stemPk.length > 2 && (stemRaw.includes(stemPk) || stemPk.includes(stemRaw)))
        ) {
          matchedPropKey = pk;
          break;
        }
      }
    }

    const finalKey = matchedPropKey || keyRaw.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

    // Generic type parsing
    const cleanVal = valRaw.replace(/\[[^\]]*\]/g, "").trim();
    let parsedVal: unknown = cleanVal;
    const propSchema = schemaProps?.[finalKey] as { type?: string } | undefined;
    if (propSchema?.type === "number" || propSchema?.type === "integer" || (!propSchema && /^-?\d+(\.\d+)?$/.test(cleanVal.replace(/[\$,]/g, "")))) {
      const num = parseFloat(cleanVal.replace(/[^0-9.-]/g, ""));
      if (!isNaN(num)) parsedVal = num;
    } else if (propSchema?.type === "boolean" || cleanVal.toLowerCase() === "true" || cleanVal.toLowerCase() === "false") {
      parsedVal = cleanVal.toLowerCase() === "true";
    } else if (typeof cleanVal === "string" && /(date|time|due|start|end|at)/i.test(finalKey)) {
      parsedVal = parseNaturalLanguageDate(cleanVal);
    }

    params[finalKey] = parsedVal;
  }

  // Natural language regex extraction for key schema fields without colons (e.g. "from Pending to Attending", "plus one count to 2")
  if (propKeys.length > 0) {
    for (const pk of propKeys) {
      if (params[pk] !== undefined) continue;
      const normPk = pk.toLowerCase();

      // Status / rsvpStatus matching ("from pending to attending", "to attending", "status to attending")
      if (normPk.includes("status") || normPk.includes("rsvp")) {
        const fromToMatch = text.match(/\bfrom\s+[a-z0-9_]+\s+to\s+["']?([a-z0-9_]+)["']?/i);
        const toMatch = fromToMatch || text.match(/\b(?:to|as|set\s+to|change\s+to|status\s+to|rsvp\s+to)\s+["']?([a-z0-9_]+)["']?/i);
        const matchedVal = toMatch ? toMatch[1].toLowerCase() : null;

        const candidateWords = ["attending", "declined", "pending", "invited", "accepted", "rejected", "completed", "in_progress", "todo", "done"];
        let finalVal = matchedVal && candidateWords.includes(matchedVal) ? matchedVal : null;

        if (!finalVal) {
          const allMatches = Array.from(text.matchAll(/\b(attending|declined|pending|invited|accepted|rejected|completed|in_progress|todo|done)\b/gi)).map(m => m[1].toLowerCase());
          if (allMatches.length > 0) {
            finalVal = allMatches[allMatches.length - 1];
          }
        }

        if (finalVal) {
          const pSchema = schemaProps?.[pk] as { enum?: string[] } | undefined;
          if (pSchema && Array.isArray(pSchema.enum)) {
            const enumMatch = pSchema.enum.find(e => e.toLowerCase() === finalVal);
            params[pk] = enumMatch || finalVal;
          } else {
            params[pk] = finalVal;
          }
        }
      }
      
      // Count / number matching ("count to 2", "plus one count to 2", "budget to 5000")
      else if (normPk.includes("count") || normPk.includes("amount") || normPk.includes("number") || normPk.includes("quantity")) {
        const numMatch = text.match(/(?:count|amount|number|quantity|total|to|is|=)\s*(\d+)/i) || text.match(/\b(\d+)\s*(?:plus|ones|count|num|quantity|total)?\b/i);
        if (numMatch) {
          const num = parseInt(numMatch[1], 10);
          if (!isNaN(num)) params[pk] = num;
        }
      }

      // Date / time matching ("date to Sep 15, 2026", "time to 5 PM")
      else if (normPk.includes("date") || normPk.includes("time") || normPk.includes("start") || normPk.includes("end")) {
        const dateMatch = text.match(/(?:date|time|start|end)?\s*(?:to|is|=)\s*([a-z0-9\s,:\-]+(?:am|pm)?)/i);
        if (dateMatch) {
          const parsedDate = parseNaturalLanguageDate(dateMatch[1]);
          if (parsedDate) params[pk] = parsedDate;
        }
      }
    }
  }

  return params;
}

            let allowedVerbs: string[] = [];
            let nodePlanParams: Record<string, unknown> | null = null;
            let instructionContent = parentInstruction ? parentInstruction : message;
            try {
              if (parentInstruction && parentInstruction.startsWith("{")) {
                const parsed = JSON.parse(parentInstruction);
                if (parsed) {
                  if (parsed.allowedVerbs && Array.isArray(parsed.allowedVerbs)) {
                    allowedVerbs = parsed.allowedVerbs;
                  } else if (parsed.actionVerb) {
                    allowedVerbs = [parsed.actionVerb];
                  }
                  if (parsed.parameters) {
                    nodePlanParams = parsed.parameters;
                  }
                  const verbStr = allowedVerbs.length > 0 ? allowedVerbs.join("/") : "EXECUTE";
                  const targetQuery = parsed.parameters?.query || parsed.parameters?.search_query || parsed.parameters?.textQuery || message;
                  instructionContent = `CURRENT USER REQUEST: "${message}"\nSUPERVISOR DIRECTIVES: Execute action "${verbStr}" on entity "${parsed.targetEntity || node.label}" for query: "${targetQuery}" with parameters: ${JSON.stringify(parsed.parameters || {})}`;
                }
              }
            } catch {
              // ignore parse errors
            }

            // NOTE: Text parameter extraction is deferred to AFTER MCP schema hydration below
            // so that live schema property names are available for accurate fuzzy matching.
            // (placeholder — actual extraction happens post-hydration at line ~2596)

            // Pillar: Memory & History (Short-Term Checkpoint)
            let memoryCheckpointMessages: ChatMessage[] = [];
            if ((node as GraphNode).memoryCheckpoint) {
              memoryCheckpointMessages = await loadThreadMemory(execThreadId);
              if (memoryCheckpointMessages.length > 0) {
                sendEvent({ type: "trace", content: `[Memory: ${node.label}] Loaded ${memoryCheckpointMessages.length} messages from thread memory.` });
              }
            }

            // Pillar: Long-Term KV Persistence
            let kvState: Record<string, string> = {};
            if ((node as GraphNode).kvPersistence) {
              kvState = await loadKvState(execThreadId);
              if (Object.keys(kvState).length > 0) {
                const kvSummary = Object.entries(kvState).map(([k, v]) => `${k}=${v.slice(0, 80)}`).join(", ");
                sendEvent({ type: "trace", content: `[KV Persistence: ${node.label}] Loaded state keys: ${kvSummary}` });
              }
            }

            // Pillar: PII Masking & Compliance — apply dynamic ruleset before LLM
            const piiMode = (node as GraphNode).piiMaskingOverride;
            let maskedInstruction = instructionContent;
            let piiCategories: { type: string; count: number; label: string }[] = [];
            let piiTotalMasked = 0;
            let piiFramework = "";
            if (piiMode) {
              const result = await applyComplianceMasking(instructionContent, piiMode, complianceConfig);
              maskedInstruction = result.masked;
              piiCategories = result.categories;
              piiTotalMasked = result.totalMasked;
              piiFramework = result.frameworkTriggered || "";
              if (piiTotalMasked > 0) {
                sendEvent({ type: "trace", content: `[PII Masking: ${node.label}] Compliance masking applied (mode: ${piiMode}${piiFramework ? `, frameworks: ${piiFramework}` : ""}).` });
                // Fire-and-forget DB audit log + SSE audit event
                logPiiAudit(execThreadId, node.label, piiMode, piiCategories, piiTotalMasked, piiFramework, piiCategories.map(c => c.type));
                sendEvent({ type: "audit", subtype: "pii_mask", node: node.label, categories: piiCategories, totalMasked: piiTotalMasked, frameworkTriggered: piiFramework || undefined });
              }
            }

            // ── MCP Schema Hydration ──
            // Fetch live inputSchema from the registered MCP servers for any tools missing one.
            // Without this, the LLM receives tools with no parameters and hallucinates required fields.
            if (node.tools && node.tools.length > 0) {
              try {
                const mcpConfigRes = await pool.query(
                  'SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1'
                );
                if (mcpConfigRes.rows.length > 0 && mcpConfigRes.rows[0].designTokens) {
                  const tokens = mcpConfigRes.rows[0].designTokens as Record<string, unknown>;
                  const mcpServersVal = tokens.mcpServers;
                  let mcpServersObj: Record<string, { serverUrl?: string; headers?: Record<string, string>; disabled?: boolean }> = {};
                  if (typeof mcpServersVal === "string") {
                    try { const p = JSON.parse(mcpServersVal); mcpServersObj = p.mcpServers || p; } catch {}
                  } else if (mcpServersVal && typeof mcpServersVal === "object") {
                    const v = mcpServersVal as Record<string, unknown>;
                    mcpServersObj = (v.mcpServers as typeof mcpServersObj) || v as typeof mcpServersObj;
                  }

                  // Build a flat map of toolName → inputSchema from all active MCP servers
                  for (const [, serverCfg] of Object.entries(mcpServersObj)) {
                    if (!serverCfg?.serverUrl || serverCfg.disabled === true) continue;
                    try {
                      let sseUrl = serverCfg.serverUrl;
                      const isDocker = process.env.DATABASE_URL?.includes("savazai-db");
                      if (isDocker && sseUrl.includes("localhost")) {
                        sseUrl = sseUrl.replace("localhost", "host.docker.internal");
                      }
                      const listRes = await fetch(sseUrl, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          ...(serverCfg.headers || {})
                        },
                        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
                        signal: AbortSignal.timeout(8000)
                      });
                      if (listRes.ok) {
                        const listData = await listRes.json() as { result?: { tools?: { name: string; description?: string; inputSchema?: Record<string, unknown> }[] } };
                        for (const t of listData?.result?.tools || []) {
                          if (t.name && t.inputSchema) {
                            globalMcpSchemaCache[t.name] = t.inputSchema;
                            if (t.description) {
                              globalMcpSchemaCache[`__desc__${t.name}`] = { desc: t.description } as Record<string, unknown>;
                            }
                          }
                        }
                      }
                    } catch { /* skip unreachable servers */ }
                  }

                    // Hydrate standard schemas for native tools if missing
                    const nativeSchemas: Record<string, { description: string; inputSchema: { type: "object"; properties: Record<string, { type: string; description: string }>; required?: string[] } }> = {
                      "google-places": {
                        description: "Search local places, businesses, venues, and points of interest with ratings, review counts, address, phone numbers, and website/Maps links.",
                        inputSchema: {
                          type: "object",
                          properties: {
                            textQuery: { type: "string", description: "Search query for locations or businesses (e.g. 'wedding decorators in Tirupati, India')" },
                            query: { type: "string", description: "Search query alias" },
                            pageSize: { type: "number", description: "Number of places to return (default: 20, max: 20)" },
                            languageCode: { type: "string", description: "Language code for the response (e.g. 'en')" },
                          },
                          required: ["textQuery"],
                        },
                      },
                      "web-search": {
                        description: "Search the web to extract real-time information, contact phone numbers, emails, and website links.",
                        inputSchema: {
                          type: "object",
                          properties: {
                            query: { type: "string", description: "Web search query (e.g. 'R2R Events & Weddings Tirupati contact phone email website')" },
                            count: { type: "number", description: "Number of search results to return (default: 5)" },
                          },
                          required: ["query"],
                        },
                      },
                    };

                    for (const [nName, nDef] of Object.entries(nativeSchemas)) {
                      if (!globalMcpSchemaCache[nName]) {
                        globalMcpSchemaCache[nName] = nDef.inputSchema as any;
                        globalMcpSchemaCache[`__desc__${nName}`] = { desc: nDef.description } as Record<string, unknown>;
                      }
                    }

                    // Merge hydrated schemas back into node.tools
                    if (Object.keys(globalMcpSchemaCache).length > 0) {
                      node.tools = node.tools.map(tool => {
                        if (!tool || typeof tool !== "object") return tool;
                        const name = tool.name || "";
                        if (globalMcpSchemaCache[name] && !tool.inputSchema) {
                          const rawSchema = globalMcpSchemaCache[name] as unknown as { type?: string; properties?: Record<string, { type: string; description: string }>; required?: string[] };
                          const hydrated: AgentflowTool = {
                            ...tool,
                            inputSchema: {
                              type: "object" as const,
                              properties: rawSchema.properties || {},
                              required: rawSchema.required,
                            }
                          };
                          if (!hydrated.description && globalMcpSchemaCache[`__desc__${name}`]) {
                            hydrated.description = (globalMcpSchemaCache[`__desc__${name}`] as { desc: string }).desc;
                          }
                          return hydrated;
                        }
                        return tool;
                      });
                      sendEvent({ type: "trace", content: `[Schema Hydration: ${node.label}] Hydrated ${Object.keys(globalMcpSchemaCache).length} tool schemas.` });
                    }
                }
              } catch (hydrationErr) {
                console.error("[MCP Schema Hydration] Failed:", hydrationErr);
              }
            }

            // ── Post-Hydration: Extract user-provided text parameters using live schema props ──
            // This runs AFTER schema hydration so live field names (from the real MCP server) are
            // available for fuzzy matching.  The result merges on top of any plan-level params.
            {
              const hydratedToolObj = (node.tools || []).find(
                t => typeof t === "object" && t !== null && (t as AgentflowTool).inputSchema?.properties
              ) as AgentflowTool | undefined;
              const liveSchemaProps = hydratedToolObj?.inputSchema?.properties as Record<string, unknown> | undefined;
              const extractedTextParams = parseParametersFromText(message, liveSchemaProps);
              if (Object.keys(extractedTextParams).length > 0) {
                nodePlanParams = { ...(nodePlanParams || {}), ...extractedTextParams };
                sendEvent({ type: "trace", content: `[Param Extraction: ${node.label}] Extracted ${Object.keys(extractedTextParams).length} parameters from user text: ${JSON.stringify(extractedTextParams)}` });
              }
            }

            // Discovery Query Assignment: Ensure discovery tools receive the current query
            const hasSearchTool = (node.tools || []).some(t => {
              const tn = (typeof t === "string" ? t : (t as AgentflowTool)?.name || "").toLowerCase();
              return tn.includes("places") || tn.includes("search") || tn.includes("yelp");
            });
            if (hasSearchTool && (!nodePlanParams || (!nodePlanParams.query && !nodePlanParams.textQuery && !nodePlanParams.search_query))) {
              nodePlanParams = { ...(nodePlanParams || {}), query: message, textQuery: message };
              sendEvent({ type: "trace", content: `[Discovery Query Assignment: ${node.label}] Assigned query: "${message}"` });
            }

            // Standardized Dynamic Tool Call Loop using Shared Context State
            const workerHistory: ChatMessage[] = [
              ...memoryCheckpointMessages,
              ...parentContext,
              { role: "user", content: `Instructions: "${maskedInstruction}"` }
            ];

            const toolsDescription = (node.tools || []).map(tool => {
              const toolName = tool && typeof tool === "object" ? (tool.name || "") : String(tool);
              const toolCategory = tool && typeof tool === "object" ? (tool.category || "mcp") : "mcp";
              const toolDesc = tool && typeof tool === "object" ? (tool.description || "Execute tool call.") : "Execute tool call.";
              let schemaText = "";
              if (tool && typeof tool === "object" && tool.inputSchema) {
                const s = tool.inputSchema;
                const propsText = Object.entries(s.properties || {}).map(([k, v]) => {
                  const req = s.required?.includes(k) ? " (required)" : "";
                  return `      "${k}" (${v.type})${req}: ${v.description}`;
                }).join("\n");
                schemaText = `  Parameters:\n${propsText || "    (none)"}`;
                if (s.required && s.required.length > 0) {
                  schemaText += `\n  Required fields: ${s.required.join(", ")}`;
                }
              }
              return `- Name: "${toolName}"\n  Category: "${toolCategory}"\n  Description: "${toolDesc}"\n${schemaText}`;
            }).join("\n\n");

            let workerSystemPrompt = `${systemPromptContext}

You have access to results from prior steps in the conversation history. Use the exact data returned in previous tool outputs. Do NOT fabricate or substitute data values that were not returned by tool calls.

You have access to the following tools:
${toolsDescription}

CRITICAL RULES:
- You MUST synthesize your responses, reports, and arguments strictly using the actual data returned by the tool calls.
- DO NOT generate placeholder, fallback, sample, or fabricated mock records when tool execution has successfully returned records.
- If a tool call returned data, you must parse and use that data directly in your response.
- When generating tables or reports from JSON records, expand all nested arrays and lists fully. If the records contain reference IDs or UUIDs, resolve them to their actual human-readable names using the relevant dataset loaded in the conversation history. Do NOT summarize or collapse detailed fields.
- You MUST ONLY call tools that are explicitly listed in your available tools section above. DO NOT attempt to call tools that are not in your assigned tools list.
- When invoking a tool, ensure all string parameters are fully formatted, clean, and professional. Replace all placeholders like [Recipient], [Your Name], [Date], or bracketed text with actual context values or omit them. Do NOT output raw template tags in tool parameters.
`;

            // Action/Notification: outbound dispatch system prompt injection
            if (node.roleTemplate === "action" || node.roleTemplate === "notification") {
              workerSystemPrompt += `\n\nACTION/NOTIFICATION NODE INSTRUCTIONS:\n- Your role is strictly outbound dispatch. You MUST ONLY execute send_email, send_sms, or whatsapp_message tools.\n- Do NOT create, update, delete, or query records — your sole purpose is dispatching notifications.\n- If the aggregated context from upstream nodes contains the required dispatch data (recipient, subject, body), use it directly.\n- Do not fabricate or guess recipient details. If recipient information is missing, report the gap clearly.\n`;
            }

            if (node.tools && node.tools.length > 0) {
              const toolsListStr = node.tools.map(t => t && typeof t === "object" ? (t.name || "") : String(t)).join(', ');
              workerSystemPrompt += `\nINSTRUCTION: Inspect the shared conversation history for accumulated outputs from prior nodes. If the overall user request specifies an action matching your available tools [${toolsListStr}], format the accumulated context and execute your assigned tool immediately.\n`;
              workerSystemPrompt += `\n\nCRITICAL INSTRUCTION: You have tools assigned to complete this task. You MUST invoke at least one tool to perform your action or retrieve required data before providing your final response. Do NOT output a conversational text response without calling your tool.\n`;
              workerSystemPrompt += `\n- MULTI-TOOL CONTACT ENRICHMENT PIPELINE: When performing local discovery or finding businesses/vendors using discovery tools (e.g. google-places), execute the discovery tool first. If phone numbers, websites, or emails are missing or unlisted for top businesses, execute follow-up web searches (e.g. using web-search with query "<Business Name> <Location> contact phone email website") to enrich the records before providing your final response.\n`;
              workerSystemPrompt += `\n- When asked to create and update an item, pass the required status field directly during creation if supported by the tool schema, or immediately call the appropriate update tool in the next step.\n`;
              workerSystemPrompt += `\n- After executing all requested tool calls, review the results and determine if additional tool calls are needed to fully complete the task. You may call multiple tools across successive turns as needed. Once no further tool actions are required, conclude your turn with a clear concise summary of the actions taken.\n`;
              workerSystemPrompt += `\n- MULTI-ITEM OPERATIONS: If the user request specifies operations on MULTIPLE items (e.g., updating or creating multiple records in a single request), you MUST execute tool calls for EACH specified item until ALL requested items have been processed! You can include multiple tool_calls objects in a single JSON block.\n`;
              workerSystemPrompt += `\n- CRITICAL: Never call the same tool with identical arguments twice. If you already created or updated a record, do not repeat the identical operation. Move on to the next required action or conclude the task.\n`;
              workerSystemPrompt += `\n- STRICT DOMAIN SCOPE: You MUST ONLY execute actions directly related to your assigned tools. If a portion of the user request refers to an action outside your assigned tools, IGNORE that portion entirely. DO NOT attempt to map out-of-scope actions to your assigned tools.\n`;
              workerSystemPrompt += `\n- CRITICAL FIELD EXTRACTION MANDATE: When calling an UPDATE or CREATE tool, carefully extract ALL target field values mentioned in the user prompt and thread history (e.g. rsvpStatus, status, plusOneCount, dietaryRestrictions, startTime, date, location, description, category, amount, budget). NEVER call an update tool with only an "id" without passing the field values to update (e.g. pass {"id": "<target_id>", "rsvpStatus": "attending"}).\n`;
              workerSystemPrompt += `\n- TARGET ITEM SCOPE: Execute updates or deletions ONLY for the item(s) explicitly named in the CURRENT user request. Do NOT execute tool calls for historical items from previous conversation turns unless explicitly named in the current prompt.\n`;
              workerSystemPrompt += `\n- CRITICAL EXCLUSIVE TARGET DIRECTIVE: You MUST ONLY invoke action tools (delete/update) for the EXACT items explicitly named in the prompt (e.g. if the prompt says "delete New Guest Name and New Guest", execute EXACTLY 2 tool calls for those 2 items). DO NOT generate tool calls for any other items returned in the list context!\n`;
              workerSystemPrompt += `\n- SINGLE CREATION DIRECTIVE: When the user requests to create or add a new record (e.g. "create a new item"), execute EXACTLY ONE create tool call for that new item. DO NOT re-execute creation tool calls for historical items mentioned in previous conversation turns.\n`;
              if (nodePlanParams && Object.keys(nodePlanParams).length > 0) {
                const verbStr = allowedVerbs.length > 0 ? allowedVerbs.join("/") : "EXECUTE";
                workerSystemPrompt += `\n\nCRITICAL APPROVED PLAN EXECUTION DIRECTIVE:
The Supervisor Plan has been APPROVED by the user to execute the action "${verbStr}" with these exact parameters:
${JSON.stringify(nodePlanParams)}

You MUST IMMEDIATELY execute the tool call matching this action using these exact parameter values.
DO NOT ask the user for additional optional parameters.
DO NOT output conversational text, questionnaires, or lists without calling the tool.
YOUR VERY FIRST RESPONSE MUST BE A TOOL CALL JSON BLOCK EXECUTING THIS ACTION NOW.\n`;
              }
            }

            workerSystemPrompt += `
If you need to invoke any tool to fulfill the task, you MUST output a JSON block in your response containing the tool call.
JSON format:
\`\`\`json
{
  "tool_calls": [
    {
      "name": "tool_name",
      "arguments": { "arg1": "val1", ... }
    }
  ]
}
\`\`\`
If you output this block, the system will run the tools and inject the results into your messages history. You can then output your final summary.
If you do NOT need to call any more tools, output your final result directly to the user without any tool_calls JSON block.`;

            let turn = 0;
            let workerFinalOutput = "";
            let hasExecutedTools = false;
            let hasToolErrors = false;
            const workerReceipts: ToolExecutionReceipt[] = [];
            const executedToolSignatures = new Map<string, number>();
            
            while (turn < 5) {
              const hasExecutedMutatingTool = workerReceipts.some(r => {
                const tn = (r.tool_name || (r as unknown as { toolName?: string }).toolName || "").toLowerCase();
                const isQuery =
                  tn.startsWith("list_") ||
                  tn.startsWith("get_") ||
                  tn.startsWith("fetch_") ||
                  tn.startsWith("search_") ||
                  tn.startsWith("read_") ||
                  tn.startsWith("query_") ||
                  tn.startsWith("find_") ||
                  tn.startsWith("show_");
                return !isQuery;
              });
              const isMutatingActionRequested = allowedVerbs.some(v => ["UPDATE", "CREATE", "DELETE"].includes(String(v).toUpperCase()));
              const forceToolChoice = (turn === 0 || (isMutatingActionRequested && !hasExecutedMutatingTool)) ? "required" : undefined;

              const response = await queryLLMWithHistory(
                node.modelConfig.provider,
                node.modelConfig.model,
                workerSystemPrompt,
                workerHistory,
                providerConfigs,
                node.tools,
                forceToolChoice
              );

              // Parse tool calls
              let toolCalls: { name: string; arguments: Record<string, unknown> }[] = [];
              const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
              const match = response.match(jsonBlockRegex);
              
              if (match) {
                try {
                  const parsed = JSON.parse(match[1].trim());
                  if (Array.isArray(parsed.tool_calls)) {
                    toolCalls = parsed.tool_calls;
                  } else if (parsed.name && parsed.arguments) {
                    toolCalls = [parsed];
                  }
                } catch {}
              } else {
                const looseMatch = response.match(/({[\s\S]*?"tool_calls"[\s\S]*?})/);
                if (looseMatch) {
                  try {
                    const parsed = JSON.parse(looseMatch[1].trim());
                    if (Array.isArray(parsed.tool_calls)) {
                      toolCalls = parsed.tool_calls;
                    }
                  } catch {}
                }
              }

              // Universal Tool Guard for ALL worker nodes with Fallback & Re-prompt for Approved Plan Steps
              if (toolCalls.length === 0 && node.tools && node.tools.length > 0) {
                if (isMutatingActionRequested && !hasExecutedMutatingTool) {
                  const mutatingTool = node.tools.find(t => {
                    const tn = (t.name || "").toLowerCase();
                    const isQuery =
                      tn.startsWith("list_") ||
                      tn.startsWith("get_") ||
                      tn.startsWith("fetch_") ||
                      tn.startsWith("search_") ||
                      tn.startsWith("read_") ||
                      tn.startsWith("query_") ||
                      tn.startsWith("find_") ||
                      tn.startsWith("show_");
                    return !isQuery;
                  });
                  if (mutatingTool && mutatingTool.name) {
                    if (turn < 2) {
                      sendEvent({ type: "trace", content: `[Mutating Action Re-Prompt: ${node.label}] System re-prompting worker to execute mutating tool "${mutatingTool.name}".` });
                      const rePromptContent = `SYSTEM RE-PROMPT: The query/list phase is complete. The user request requires executing the action "${allowedVerbs.join("/")}" using your assigned tool "${mutatingTool.name}". You MUST output a tool_calls JSON block to execute "${mutatingTool.name}" now. Do NOT output plain text asking for confirmation. Execute "${mutatingTool.name}" NOW.`;
                      workerHistory.push({ role: "assistant", content: response });
                      workerHistory.push({ role: "user", content: rePromptContent });
                      turn++;
                      continue;
                    } else {
                      sendEvent({ type: "trace", content: `[Mutating Action Fallback Execution: ${node.label}] Auto-invoking mutating tool "${mutatingTool.name}" to complete requested action.` });
                      toolCalls = [{ name: mutatingTool.name, arguments: nodePlanParams || {} }];
                    }
                  }
                }

                if (turn === 0 && nodePlanParams && Object.keys(nodePlanParams).length > 0) {
                  // Fallback: auto-synthesize the tool call for approved plan parameters if LLM returned plain text
                  const matchingTool = node.tools.find(t => {
                    const tName = (t.name || "").toLowerCase();
                    const verb = allowedVerbs[0] || "CREATE";
                    return tName.includes(verb.toLowerCase()) || tName.startsWith("create_") || tName.startsWith("update_") || tName.startsWith("delete_");
                  }) || node.tools[0];
                  if (matchingTool && matchingTool.name) {
                    sendEvent({ type: "trace", content: `[Plan Execution Fallback: ${node.label}] Auto-invoking tool "${matchingTool.name}" with approved plan parameters.` });
                    toolCalls = [{ name: matchingTool.name, arguments: nodePlanParams }];
                  }
                }
                if (toolCalls.length === 0 && turn === 0) {
                  const toolsListStr = node.tools.map(t => t && typeof t === "object" ? (t.name || "") : String(t)).join(', ');
                  const rePromptContent = `SYSTEM RE-PROMPT: You are a specialist worker node with assigned tools: [${toolsListStr}]. You must call your assigned tool(s) to fetch or execute actions for this step. Do not return plain text without calling your tools.`;
                  
                  workerHistory.push({ role: "assistant", content: response });
                  workerHistory.push({
                    role: "user",
                    content: rePromptContent
                  });
                  
                  // Trigger a second LLM turn (turn === 1)
                  turn = 1;
                  continue;
                }
              }

              workerHistory.push({ role: "assistant", content: response });

              if (toolCalls.length > 0) {
                hasExecutedTools = true;
                for (const tc of toolCalls) {
                  const toolName = tc.name;
                  const boundTool = (node.tools || []).find(t => t && t.name === toolName);
                  
                  if (!boundTool) {
                    sendEvent({ type: "trace", content: `[Worker Tool: ${node.label}] Tool ${toolName} rejected: Out of node tool scope.` });
                    workerHistory.push({
                      role: "tool",
                      name: toolName,
                      content: `ERROR: Tool '${toolName}' is not available for this node. Stick exclusively to your assigned tools.`
                    });
                    continue;
                  }

                  // Verify Supervisor Plan approved verb constraints (multi-verb support; READ-ONLY query tools are always permitted)
                  if (allowedVerbs.length > 0) {
                    const toolVerb = getActionVerbFromToolName(toolName);
                    const isReadOnlyVerb = toolVerb === "LIST" || toolVerb === "UNKNOWN";
                    if (!isReadOnlyVerb && !allowedVerbs.includes(toolVerb)) {
                      sendEvent({
                        type: "trace",
                        content: `[Supervisor Plan Block: ${node.label}] Tool "${toolName}" matching verb "${toolVerb}" rejected: Only "${allowedVerbs.join("/")}" actions are approved in the Supervisor Plan.`
                      });
                      workerHistory.push({
                        role: "tool",
                        name: toolName,
                        content: `ERROR: Execution forbidden. The Supervisor's approved execution plan only allows '${allowedVerbs.join("/")}' actions for this node.`
                      });
                      continue;
                    }
                  }

                  const toolCategory = boundTool.category || "mcp";

                  if (toolCategory === "native") {
                    sendEvent({ type: "trace", content: `[Worker Tool: ${node.label}] Executing tool: ${toolName} ...` });
                  } else {
                    sendEvent({ type: "trace", content: `[Worker Tool: ${node.label}] Executing MCP tool: ${toolName}` });
                  }
                  
                  // Fetch default ambient parameters from system_configurations
                  const ambientParams: Record<string, unknown> = {};
                  try {
                    const configRes = await pool.query(
                      'SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1'
                    );
                    if (configRes.rows.length > 0 && configRes.rows[0].designTokens) {
                      const tokens = configRes.rows[0].designTokens as Record<string, unknown>;
                      const ambientStr = tokens.defaultAmbientParameters;
                      if (ambientStr) {
                        const parsed = typeof ambientStr === "string" ? JSON.parse(ambientStr) : ambientStr;
                        if (parsed && typeof parsed === "object") {
                          Object.assign(ambientParams, parsed);
                        }
                      }
                    }
                  } catch (e) {
                    console.error("Failed to load ambient params:", e);
                  }

                  // Merge ambient params with tool arguments
                  const toolArgs = {
                    ...ambientParams,
                    ...tc.arguments
                  };

                  const hasEmptyPlanParams = !nodePlanParams || Object.keys(nodePlanParams).length === 0;

                  if (nodePlanParams && !hasEmptyPlanParams) {
                    for (const key of Object.keys(nodePlanParams)) {
                      if (nodePlanParams[key] !== undefined && nodePlanParams[key] !== null && nodePlanParams[key] !== "") {
                        if (!toolArgs[key] || toolArgs[key] === key) {
                          toolArgs[key] = nodePlanParams[key];
                        }
                      }
                    }
                    sendEvent({
                      type: "trace",
                      content: `[Supervisor Plan Enforcement: ${node.label}] Enforcing parameter payload: ${JSON.stringify(nodePlanParams)}`
                    });
                  }

                  const signature = toolName + ":" + JSON.stringify(toolArgs);
                  const execCount = executedToolSignatures.get(signature) || 0;
                  if (execCount >= 2) {
                    sendEvent({
                      type: "trace",
                      content: `[Worker Loop Guard: ${node.label}] Tool ${toolName} called with identical arguments more than twice. Terminating loop to prevent infinite recursion.`
                    });
                    workerFinalOutput = response;
                    turn = 5;
                    break;
                  }
                  executedToolSignatures.set(signature, execCount + 1);

                  // HITL Policy Interception Check
                  const policy = (node as GraphNode).hitlPolicy || node.data?.guardrails?.hitlPolicy;
                  const isApproved = approvedPlan && Array.isArray(approvedPlan);
                  if (!isApproved && shouldInterceptHITL(policy, toolName)) {
                    sendEvent({
                      type: "trace",
                      content: `[HITL Guardrail Gate] Interception triggered for node "${node.label}" before executing tool "${toolName}". Pausing execution.`
                    });
                    sendEvent({
                      type: "hitl",
                      state: "PAUSED_AWAITING_HUMAN_APPROVAL",
                      executionState: "PAUSED_AWAITING_HUMAN_APPROVAL",
                      nodeId: nodeId,
                      toolName: toolName,
                      toolArgs: toolArgs
                    });
                    return `[HITL Intercepted] Execution paused before tool "${toolName}"`;
                  }

                  let toolResult = "";
                  try {
                    if (toolCategory === "native") {
                      const to = String(toolArgs.to || toolArgs.recipient || "").trim();
                      if (to && toolName === "send-email") {
                        if (!isValidEmail(to)) {
                          toolResult = JSON.stringify({ success: false, error: "ERROR: Cannot send email. Valid recipient email address is required. Blocked dummy/unverified domain." });
                        } else {
                          const subject = String(toolArgs.subject || "Notification");
                          const body = String(toolArgs.body || toolArgs.content || "");
                          const emailRes = await sendEmailReal(to, subject, body, providerConfigs, pool);
                          toolResult = JSON.stringify(emailRes);
                        }
                      } else {
                        toolResult = await executeNativeTool(toolName, toolArgs, designTokens);
                      }
                    } else {
                      const serverId = boundTool.serverId || toolName;
                      console.log(`[MCP Tool Execute] Calling tool "${toolName}" with arguments:`, JSON.stringify(toolArgs, null, 2));
                      toolResult = await runMcpToolWithResilience(serverId, toolName, toolArgs, node.tools);
                    }
                  } catch (toolErr) {
                    const toolErrMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
                    sendEvent({
                      type: "trace",
                      content: `[Worker Tool Error: ${node.label}] Tool ${toolName} execution failed: ${toolErrMsg}`
                    });
                    toolResult = JSON.stringify({ error: toolErrMsg });
                  }
                  
                  toolResult = String(sanitizeDataPayloads(toolResult));
                  toolResult = await autoResolveOutputForeignUuids(toolResult, node.tools);

                  let itemCount = 0;
                  try {
                    const parsed = JSON.parse(toolResult);
                    if (Array.isArray(parsed)) {
                      itemCount = parsed.length;
                    } else if (parsed && typeof parsed === "object") {
                      // Find any array property in the result for item counting
                      const arrayVal = Object.values(parsed).find(v => Array.isArray(v));
                      itemCount = arrayVal ? (arrayVal as unknown[]).length : 1;
                    } else {
                      itemCount = 1;
                    }
                  } catch {
                    itemCount = 1;
                  }

                  const toolResultObj = tryParseJson(toolResult);
                  const isErrorResult = toolResultObj && (toolResultObj.isError === true || toolResultObj.error);

                  if (isErrorResult) {
                    hasToolErrors = true;
                    const errText = String(toolResultObj.error || "Unknown MCP error");
                    sendEvent({ type: "trace", content: `[Worker Tool Error: ${node.label}] MCP tool ${toolName} returned error: ${errText}` });
                    const formattedError = `[STATUS: FAILED] Tool ${toolName} failed: ${errText}`;
                    workerHistory.push({ role: "tool", name: toolName, content: formattedError });
                    workerReceipts.push({ tool_name: toolName, status: "FAILED", output_payload: errText });
                  } else {
                    if (toolCategory === "native") {
                      sendEvent({ type: "trace", content: `[Worker Tool: ${node.label}] Tool ${toolName} returned success.` });
                    } else {
                      sendEvent({ type: "trace", content: `[Worker Tool: ${node.label}] MCP tool ${toolName} returned ${itemCount} items.` });
                    }
                    const formattedToolResult = `[STATUS: SUCCESS] Tool ${toolName} executed successfully. Returned data: ${toolResult}`;
                    workerHistory.push({ role: "tool", name: toolName, content: formattedToolResult });
                    workerReceipts.push({ tool_name: toolName, status: "SUCCESS", output_payload: toolResult });
                  }

                }
                turn++;
              } else {
                if (node.tools && node.tools.length > 0 && !hasExecutedTools) {
                  sendEvent({
                    type: "trace",
                    content: `[Worker Warning: ${node.label}] Completed execution without invoking its assigned tools.`
                  });
                }
                workerFinalOutput = response;
                break;
              }
            }

            if (!workerFinalOutput) {
              workerFinalOutput = workerHistory[workerHistory.length - 1]?.content || "";
            }

            // Synthesizer-safe output: include all successful tool payloads
            let sanitizedFinalOutput = String(sanitizeDataPayloads(workerFinalOutput));
            if (hasExecutedTools && !hasToolErrors) {
              const successReceipts = workerReceipts.filter(r => r.status === "SUCCESS");
              if (successReceipts.length > 0) {
                sanitizedFinalOutput = successReceipts.map(r => `[DATA PAYLOAD: ${r.tool_name}]\n${r.output_payload}`).join("\n\n");
              } else {
                sanitizedFinalOutput = `Node ${node.label}: Execution Completed Successfully.`;
              }
            }
            workerResults.push({ nodeLabel: node.label, output: sanitizedFinalOutput, receipts: workerReceipts });
            // Push to global shared context for supervisors/downstream — also to parentContext snapshot if isolated
            sharedContextMessages.push({ role: "assistant", content: `[Agent: ${node.label}] ${sanitizedFinalOutput}` });
            if (parentContext !== sharedContextMessages) {
              parentContext.push({ role: "assistant", content: `[Agent: ${node.label}] ${sanitizedFinalOutput}` });
            }
            sendEvent({ type: "trace", content: `[Worker Complete: ${node.label}] Task finished.` });

            // Persist memory checkpoint and KV state after worker completes
            if ((node as GraphNode).memoryCheckpoint) {
              for (let i = 0; i < workerHistory.length; i++) {
                const msg = workerHistory[i];
                if (msg.role && msg.content) {
                  await saveThreadMemory(execThreadId, i, msg.role, msg.content);
                }
              }
              sendEvent({ type: "trace", content: `[Memory: ${node.label}] Saved ${workerHistory.length} messages to thread memory.` });
            }
            if ((node as GraphNode).kvPersistence && Object.keys(kvState).length > 0) {
              const turnKey = `turn_${Date.now()}`;
              kvState[turnKey] = sanitizedFinalOutput.slice(0, 500);
              await saveKvState(execThreadId, kvState);
            }

            return workerFinalOutput;
          } else {
            // Synthesizer, aggregator, or unrecognized roles — handled by the standalone synthesizer section below
            if (role === "synthesizer" || role === "aggregator") {
              sendEvent({ type: "trace", content: `[Synthesizer Boundaries] Node "${node.label}" recognized — synthesis handled by downstream aggregator block.` });
            }
            return "";
          }
        }

        sendEvent({ type: "trace", content: `[Graph Exec] Starting graph run with ${typedNodes.length} nodes & ${typedEdges.length} connections.` });

        // Start recursive traversal from root supervisor
        const traversalResult = await runAgentNode(supervisorNode.id, message);

        if (traversalResult && traversalResult.includes("[HITL Intercepted]")) {
          controller.close();
          return;
        }

        sendEvent({ type: "trace", content: `[Sync Boundary] Parallel edges resolved. Proceeding to final synthesis.` });

        // 4. Synthesizer Final Output Resolution
        if (synthesizerNode && (globalSelectedIds.length > 0 || workerResults.length > 0)) {
          sendEvent({ type: "trace", content: `[Synthesizer: ${synthesizerNode.label}] Aggregating parallel outputs...` });
          
          const msgStr = String(message || "");
          const msgLower = msgStr.toLowerCase();
          const emailAddressMatch = msgStr.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
          const userRequestsEmail = Boolean(emailAddressMatch) ||
            msgLower.includes("email") ||
            msgLower.includes("mail to") ||
            msgLower.includes("send to") ||
            msgLower.includes("send this") ||
            msgLower.includes("forward to") ||
            msgLower.includes("dispatch");
          const userRequestsPdf = msgLower.includes("pdf") || msgLower.includes("generate pdf");
          const userRequestsCsv = msgLower.includes("csv") || msgLower.includes("download csv") || msgLower.includes("export csv") || msgLower.includes("to a csv") || msgLower.includes("to csv");

          // Filter synthesizer tools: remove database mutation tools AND remove export tools NOT requested by the user
          const synthTools: AgentflowTool[] = (synthesizerNode.tools || [])
            .filter((t): t is AgentflowTool => {
              if (!t) return false;
              const toolNameStr = typeof t === "string" ? t : (t.name || "");
              const n = String(toolNameStr).toLowerCase();
              const blocked = ["create", "delete", "update", "remove", "insert", "destroy", "modify"];
              if (blocked.some(b => n.includes(b))) return false;
              if ((n === "generate-pdf" || n === "generate_pdf" || n === "pdf_export") && !userRequestsPdf) return false;
              if ((n === "generate-csv" || n === "generate_csv" || n === "csv_export") && !userRequestsCsv) return false;
              if ((n === "send-email" || n === "send_email") && !userRequestsEmail) return false;
              return true;
            })
            .map(t => (typeof t === "string" ? { name: t, category: "native" } : t));

          // Auto-equip send-email, generate-pdf, and generate-csv if prompt explicitly requests them
          if (userRequestsEmail && !synthTools.some(t => t && (t.name === "send-email" || t.name === "send_email"))) {
            synthTools.push({ name: "send-email", category: "native" });
          }
          if (userRequestsPdf && !synthTools.some(t => t && (t.name === "generate-pdf" || t.name === "generate_pdf"))) {
            synthTools.push({ name: "generate-pdf", category: "native" });
          }
          if (userRequestsCsv && !synthTools.some(t => t && (t.name === "generate-csv" || t.name === "generate_csv"))) {
            synthTools.push({ name: "generate-csv", category: "native" });
          }

          // Hydrate input schemas for synthTools (native & MCP) so LLM receives complete function signatures
          for (const st of synthTools) {
            if (!st) continue;
            const sName = String(st.name || "").toLowerCase();
            if (sName === "send-email") {
              st.inputSchema = {
                type: "object",
                properties: {
                  to: { type: "string", description: "Recipient email address" },
                  subject: { type: "string", description: "Email subject line" },
                  body: { type: "string", description: "Full formatted Markdown or HTML email body" }
                },
                required: ["to"]
              };
              st.description = "Send a Markdown or HTML email report to a recipient email address.";
            } else if (sName === "generate-pdf" || sName === "generate_pdf") {
              st.inputSchema = {
                type: "object",
                properties: {
                  title: { type: "string", description: "Report title" },
                  content: { type: "string", description: "Markdown or text content of the report" },
                  filename: { type: "string", description: "Output PDF filename (optional)" }
                },
                required: ["content"]
              };
              st.description = "Generate a formatted PDF document with downloadable data URI link.";
            } else if (sName === "generate-csv" || sName === "generate_csv") {
              st.inputSchema = {
                type: "object",
                properties: {
                  title: { type: "string", description: "CSV export title" },
                  content: { type: "string", description: "Raw CSV string, Markdown table string, or array of records" },
                  filename: { type: "string", description: "Output CSV filename (optional)" }
                },
                required: ["content"]
              };
              st.description = "Generate an RFC 4180 compliant CSV document with downloadable data URI link.";
            } else if (st.name && globalMcpSchemaCache[st.name]) {
              st.inputSchema = globalMcpSchemaCache[st.name] as unknown as AgentflowTool["inputSchema"];
            }
          }

          const synthToolsListStr = synthTools.map(t => t ? (t.name || "") : "").filter(Boolean).join(", ");
          
          // Build ground-truth receipts context
          const receiptBlocks = workerResults
            .filter(r => r.receipts && r.receipts.length > 0)
            .map(r => `--- [Agent: ${r.nodeLabel}] ---\n${r.receipts.map(rec =>
              `EXECUTION_RECEIPT: tool="${rec.tool_name}" status="${rec.status}" payload=${rec.output_payload}`
            ).join("\n")}`);
          const hasReceipts = receiptBlocks.length > 0;
          const receiptsJson = JSON.stringify(workerResults.map(r => ({
            node: r.nodeLabel,
            receipts: r.receipts || []
          })), null, 2);

          // Annotate each worker result using explicit receipts (no text parsing)
          const annotatedResults = workerResults.map(r => {
            const failReceipt = (r.receipts || []).find(rec => rec.status === "FAILED");
            const status = failReceipt ? "FAILED" : ((r.receipts || []).length > 0 ? "SUCCESS" : "INFO");
            return `--- [Agent: ${r.nodeLabel}] ---\n[STATUS: ${status}]\n${r.output}`;
          });

          const aggregationContext = `Gathered Parallel Agent Outputs:\n\n` + 
            annotatedResults.join("\n\n") + 
            (hasReceipts ? `\n\nEXECUTION RECEIPTS (ground-truth action audit log):\n${receiptsJson}` : "") +
            `\n\nOriginal User Request: ${msgStr}`;

          const systemPromptContext = synthesizerNode.systemPrompt || "Aggregate findings and format cleanly.";
          const synthesizerPrompt = `${systemPromptContext}

You are the Synthesizer Agent. Your primary role is to aggregate, validate, and report the execution results from downstream worker nodes.

CRITICAL INSTRUCTIONS:
- ZERO DATA HALLUCINATION MANDATE: You must synthesize a unified response based strictly on the actual facts, numbers, and execution receipts returned by the worker nodes below. If upstream worker nodes returned no results or failed, state clearly: "No search results were retrieved from the tools." NEVER invent or fabricate sample business names, phone numbers, ratings, or addresses!
- ACTION VERIFICATION & RECEIPT GROUNDING MANDATE:
  * Only confirm that an email was sent if an explicit successful execution receipt (status: "sent" or success: true) exists from the 'send-email' tool. If no email tool was executed, state: "Email action could not be completed because the email tool was not invoked in this pipeline run."
  * Only confirm that a CSV or PDF file was generated if a valid download link was returned from 'generate-csv' or 'generate-pdf'.
- FORMAT RESTRICTION MANDATE:
  * Do NOT mention, generate, or format PDF reports/links unless the user explicitly requested a PDF in their prompt!
  * Do NOT mention or format CSV exports unless the user explicitly requested a CSV in their prompt!
- FOCUS EXCLUSIVELY ON THE CURRENT TURN ACTION: Report on the current action executed in the current turn trace. Do NOT re-print tables or datasets from prior conversation turns (e.g., do not output historical data when adding a new record) unless the user explicitly asks for a combined overview.
- HUMAN-READABLE DATE & TIME FORMATTING MANDATE: NEVER display raw ISO 8601 timestamp strings (e.g. "2026-09-01T12:33:08.468Z") in report tables or output text! Convert all date/time fields into clean human-readable date strings (e.g. "September 1, 2026" or "Sep 1, 2026 at 12:33 PM").
- HIDE RAW SYSTEM UUID & ID COLUMNS: DO NOT render raw database UUID string columns (e.g. "e1d59c57-8392-4004-94fa-c9203ead34c2") in report tables meant for human viewing. Map status IDs or foreign keys to readable names or omit raw system ID columns.
- CURRENCY FORMATTING: Format all monetary amounts cleanly with currency symbols and commas (e.g. "₹8,00,000", "$800,000").
- CONTACT, WEBSITE, AND REVIEW MATRIX FORMATTING MANDATE: For business discovery and location tables, format standard markdown table columns:
  | Business Name | ⭐ Rating | Review Count | Address | 📞 Contact / Email | 🌐 Website / Maps |
  - Format phone numbers cleanly into clickable tel links (e.g. \[📞 +91 70043 38655\](tel:+917004338655) or formatted numbers). If missing, display "Not listed".
  - Format email addresses into mailto links (e.g. \[📧 email@domain.com\](mailto:email@domain.com)).
  - Format websites into \[🌐 Website\](url) and Google Maps links into \[🗺️ Google Maps\](url).
- MANDATORY REPORT RENDERING & DATA MATRIX MANDATE:
  * In your final markdown report, you MUST ALWAYS output the comprehensive Markdown table containing ALL discovered items, caterers, vendors, or businesses with columns:
    | Business Name | ⭐ Rating | Review Count | Address | 📞 Contact / Email | 🌐 Website / Maps |
  * NEVER output only an "Executive Summary" or brief status note without displaying the complete table matrix of records!
  * When 'generate-csv' has executed, you MUST copy the exact markdown link (e.g. '[ 📥 Download CSV Export: filename.csv ](data:text/csv;charset=utf-8;base64,...)') returned in the tool output into your final response under a dedicated '### 📥 Download CSV Export' section so the user can download the file!
  * When 'send-email' is executed, confirm the recipient email address under a dedicated '### 📧 Email Dispatch Confirmation' section.
  * CRITICAL RULE: NEVER omit the Markdown table from your final response, even if you sent an email or exported a CSV! The user MUST ALWAYS see the complete data table directly in the chat interface!
- EXECUTIVE SUMMARY & STRATEGIC RECOMMENDATIONS: When the user requests an "Executive Summary", "Overview", or "Report with Recommendations", DO NOT output only raw data tables! You MUST provide: 1) Executive Summary Overview & Key Highlights, 2) Key Metrics Summary, 3) Strategic Recommendations & Action Items, followed by 4) Formatted Entity Data Tables.
- COMPLETE DATA RENDERING MANDATE: Include ALL items returned in worker tool payloads. DO NOT truncate, omit, or skip items from the dataset!
- STRICT MULTI-NODE DATA ISOLATION & ENTITY SEPARATION: By default, present each active worker node's dataset under its own dedicated section with a clear Markdown heading (e.g. "### Entity A List" and "### Entity B List"). DO NOT mix rows or columns between different worker node datasets unless the user explicitly requests a combined/unified overview or single table.
- ${hasReceipts ? "The ground-truth EXECUTION RECEIPTS block above is the authoritative source for determining whether actions succeeded or failed. Base your report strictly on it." : "Base your report on the data returned in the agent outputs above."}
${synthTools.length > 0 ? `
MANDATORY MULTI-ACTION TOOL INVOCATION MANDATE:
You have action tools available [${synthToolsListStr}].
* If the user requested a downloadable CSV file (e.g., "csv file", "download csv", "csv export"): You MUST invoke the 'generate-csv' tool with title, content (or table data rows), and filename based on CURRENT TURN data.
* If the user requested an email (e.g., provided an email address such as "${emailAddressMatch ? emailAddressMatch[0] : "recipient email"}" or asked to send/email the report): You MUST invoke the 'send-email' tool with the recipient email ('to'), subject, and formatted HTML/Markdown body based on CURRENT TURN data.
* When BOTH CSV download and email dispatch are requested, you MUST invoke BOTH tools across sequential turns before writing your final synthesis markdown report. Do NOT stop after invoking only one tool!
` : ""}`;

          // Turn-scoped idempotency lock set to prevent duplicate tool execution
          const executedSynthActions = new Set<string>();

          async function executeSynthToolCalls(synthHistory: ChatMessage[], toolCalls: { name: string; arguments: Record<string, unknown> }[]): Promise<void> {
            for (const tc of toolCalls) {
              const toolName = String(tc.name || "");
              const boundTool = synthTools.find(t => t && t.name === toolName);
              if (!boundTool) {
                synthHistory.push({ role: "tool", name: toolName, content: `ERROR: Tool '${toolName}' is not available.` });
                continue;
              }
              let result = "";
              try {
                const nodeLabels = workerResults.map(r => r.nodeLabel).join(" & ");
                const dynamicTitle = nodeLabels ? `${nodeLabels} Report` : "SavazAI Summary Report";
                const dynamicFilename = nodeLabels ? nodeLabels.toLowerCase().replace(/[^a-z0-9]+/g, "_") : "export";

                if (toolName === "send-email" || toolName === "send_email") {
                  let to = String(tc.arguments?.to || tc.arguments?.recipient || tc.arguments?.email || "").trim();
                  if (!to || !isValidEmail(to)) {
                    to = fallbackRecipientEmail;
                  }
                  if (!to || !isValidEmail(to)) {
                    sendEvent({ type: "trace", content: `[Synthesizer Tool: send-email] Skipping email dispatch - no valid recipient email provided.` });
                    synthHistory.push({ role: "tool", name: toolName, content: JSON.stringify({ error: "No valid recipient email provided." }) });
                    continue;
                  }

                  const emailKey = `send-email:${to.toLowerCase()}`;
                  if (executedSynthActions.has("send-email") || executedSynthActions.has(emailKey)) {
                    sendEvent({ type: "trace", content: `[Synthesizer Tool: send-email] Idempotency lock: Skipping duplicate email dispatch to ${to}.` });
                    synthHistory.push({ role: "tool", name: toolName, content: JSON.stringify({ status: "sent", to, note: "Already dispatched in this turn." }) });
                    continue;
                  }
                  executedSynthActions.add("send-email");
                  executedSynthActions.add(emailKey);

                  const subject = String(tc.arguments?.subject || dynamicTitle);
                  
                  // Ground the email body strictly to the current turn's worker results
                  const currentWorkerOutput = workerResults.map(r => r.output).join("\n\n");
                  let rawBody = String(tc.arguments?.body || tc.arguments?.content || tc.arguments?.html || "").trim();
                  const rawBodyHasRecords = Boolean(extractRecordsFromPayload(rawBody)) || (rawBody.includes("|") && rawBody.split("\n").filter(l => l.includes("|")).length >= 3);
                  if (!rawBody || !rawBodyHasRecords) {
                    rawBody = currentWorkerOutput || aggregationContext;
                  }

                  let html = tc.arguments?.html ? String(tc.arguments.html) : "";
                  if (!html || (!html.includes("<table") && !html.includes("<div"))) {
                    html = formatHtmlEmailBody(subject, rawBody);
                  }
                  sendEvent({ type: "trace", content: `[Synthesizer Tool: send-email] Dispatching formatted HTML report email to ${to}...` });
                  const emailRes = await sendEmailReal(to, subject, html || rawBody, providerConfigs, pool);
                  result = typeof emailRes === "string" ? emailRes : JSON.stringify(emailRes);
                } else if (toolName === "generate-pdf" || toolName === "generate_pdf" || toolName === "pdf_export") {
                  const pdfKey = `generate-pdf:${dynamicFilename}`;
                  if (executedSynthActions.has("generate-pdf") || executedSynthActions.has(pdfKey)) {
                    sendEvent({ type: "trace", content: `[Synthesizer Tool: generate-pdf] Idempotency lock: PDF export already generated.` });
                    const previousPdf = synthHistory.find(m => m.role === "tool" && (m.name === "generate-pdf" || m.name === "generate_pdf"));
                    if (previousPdf) {
                      synthHistory.push({ role: "tool", name: toolName, content: previousPdf.content });
                      continue;
                    }
                  }
                  executedSynthActions.add("generate-pdf");
                  executedSynthActions.add(pdfKey);

                  const pdfTitle = String(tc.arguments?.title || dynamicTitle);
                  const currentWorkerOutput = workerResults.map(r => r.output).join("\n\n");
                  let pdfContent = String(tc.arguments?.content || tc.arguments?.body || "").trim();
                  const pdfContentHasRecords = Boolean(extractRecordsFromPayload(pdfContent)) || (pdfContent.includes("|") && pdfContent.split("\n").filter(l => l.includes("|")).length >= 3);
                  if (!pdfContent || !pdfContentHasRecords) {
                    pdfContent = currentWorkerOutput || aggregationContext;
                  }
                  const pdfFilename = String(tc.arguments?.filename || dynamicFilename);
                  sendEvent({ type: "trace", content: `[Synthesizer Tool: generate-pdf] Generating PDF document "${pdfTitle}"...` });
                  const pdfRes = await executeNativeTool("generate-pdf", { title: pdfTitle, content: pdfContent, filename: pdfFilename }, designTokens);
                  result = typeof pdfRes === "string" ? pdfRes : JSON.stringify(pdfRes);
                } else if (toolName === "generate-csv" || toolName === "generate_csv" || toolName === "csv_export") {
                  const csvKey = `generate-csv:${dynamicFilename}`;
                  if (executedSynthActions.has("generate-csv") || executedSynthActions.has(csvKey)) {
                    sendEvent({ type: "trace", content: `[Synthesizer Tool: generate-csv] Idempotency lock: CSV export already generated.` });
                    const previousCsv = synthHistory.find(m => m.role === "tool" && (m.name === "generate-csv" || m.name === "generate_csv"));
                    if (previousCsv) {
                      synthHistory.push({ role: "tool", name: toolName, content: previousCsv.content });
                      continue;
                    }
                  }
                  executedSynthActions.add("generate-csv");
                  executedSynthActions.add(csvKey);

                  const csvTitle = String(tc.arguments?.title || (nodeLabels ? `${nodeLabels} Export` : "Export"));
                  const currentWorkerOutput = workerResults.map(r => r.output).join("\n\n");
                  let csvContent = String(tc.arguments?.content || tc.arguments?.body || tc.arguments?.data || "").trim();
                  const csvContentHasRecords = Boolean(extractRecordsFromPayload(csvContent)) || (csvContent.includes("|") && csvContent.split("\n").filter(l => l.includes("|")).length >= 3);
                  if (!csvContent || !csvContentHasRecords) {
                    csvContent = currentWorkerOutput || aggregationContext;
                  }
                  const csvFilename = String(tc.arguments?.filename || dynamicFilename);
                  sendEvent({ type: "trace", content: `[Synthesizer Tool: generate-csv] Generating RFC 4180 CSV export "${csvFilename}"...` });
                  const csvRes = await executeNativeTool("generate-csv", { title: csvTitle, content: csvContent, filename: csvFilename }, designTokens);
                  result = typeof csvRes === "string" ? csvRes : JSON.stringify(csvRes);
                } else if (boundTool.category === "native") {
                  const nativeRes = await executeNativeTool(toolName, tc.arguments || {}, designTokens);
                  result = typeof nativeRes === "string" ? nativeRes : JSON.stringify(nativeRes);
                } else {
                  result = await runMcpToolWithResilience(boundTool.serverId || toolName, toolName, tc.arguments || {}, synthTools);
                }
              } catch (toolErr) {
                const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
                result = JSON.stringify({ error: errMsg });
              }
              result = String(sanitizeDataPayloads(result));
              synthHistory.push({ role: "tool", name: toolName, content: result });
              const errText = tryParseJson(result)?.error;
              sendEvent({ type: "trace", content: `[Synthesizer Tool] ${toolName} ${errText ? `error: ${errText}` : "completed successfully"}` });
            }
          }

          // Stream the synthesizer LLM response
          let finalResult = "";
          if (synthTools.length > 0) {
            // Tool-enabled synthesizer: worker-style loop for function calling
            let synthTurn = 0;
            // Strictly isolate synthesizer context to the current turn's worker results (aggregationContext)
            // to guarantee zero data bleeding from prior conversational turns
            const synthHistory: ChatMessage[] = [
              { role: "user", content: aggregationContext }
            ];
            while (synthTurn < 5) {
              const pendingEmail = userRequestsEmail && !executedSynthActions.has("send-email") && !synthHistory.some(m => m.role === "tool" && (m.name === "send-email" || m.name === "send_email"));
              const pendingCsv = userRequestsCsv && !executedSynthActions.has("generate-csv") && !synthHistory.some(m => m.role === "tool" && (m.name === "generate-csv" || m.name === "generate_csv"));
              const pendingPdf = userRequestsPdf && !executedSynthActions.has("generate-pdf") && !synthHistory.some(m => m.role === "tool" && (m.name === "generate-pdf" || m.name === "generate_pdf"));
              const hasPendingRequestedTool = pendingEmail || pendingCsv || pendingPdf;
              const forceTools = (synthTurn < 3 && hasPendingRequestedTool) ? "required" : undefined;
              const response = await queryLLMWithHistory(
                synthesizerNode.modelConfig.provider,
                synthesizerNode.modelConfig.model,
                synthesizerPrompt,
                synthHistory,
                providerConfigs,
                synthTools,
                forceTools
              );
              const toolCalls = parseToolCalls(response);
              synthHistory.push({ role: "assistant", content: response });
              if (toolCalls.length > 0) {
                await executeSynthToolCalls(synthHistory, toolCalls);
                synthTurn++;
              } else {
                finalResult = response;
                break;
              }
            }

            // Guaranteed Fallback Execution Guard: If user explicitly requested email or CSV and tool wasn't called, invoke now!
            const emailExecuted = executedSynthActions.has("send-email") || synthHistory.some(m => m.role === "tool" && (m.name === "send-email" || m.name === "send_email"));
            if (userRequestsEmail && !emailExecuted && synthTools.some(t => t.name === "send-email" || t.name === "send_email")) {
              const dynamicTargetEmail = emailAddressMatch ? emailAddressMatch[0] : fallbackRecipientEmail;
              if (dynamicTargetEmail && isValidEmail(dynamicTargetEmail)) {
                const nodeLabels = workerResults.map(r => r.nodeLabel).join(" & ");
                const dynamicTitle = nodeLabels ? `${nodeLabels} Report` : "SavazAI Summary Report";
                await executeSynthToolCalls(synthHistory, [{
                  name: "send-email",
                  arguments: {
                    to: dynamicTargetEmail,
                    subject: dynamicTitle,
                    body: workerResults.map(r => r.output).join("\n\n") || aggregationContext
                  }
                }]);
              }
            }

            const csvExecuted = executedSynthActions.has("generate-csv") || synthHistory.some(m => m.role === "tool" && (m.name === "generate-csv" || m.name === "generate_csv"));
            if (userRequestsCsv && !csvExecuted && synthTools.some(t => t.name === "generate-csv" || t.name === "generate_csv")) {
              const nodeLabels = workerResults.map(r => r.nodeLabel).join(" & ");
              const dynamicFilename = nodeLabels ? nodeLabels.toLowerCase().replace(/[^a-z0-9]+/g, "_") : "export";
              await executeSynthToolCalls(synthHistory, [{
                name: "generate-csv",
                arguments: {
                  title: nodeLabels ? `${nodeLabels} Export` : "Export",
                  content: workerResults.map(r => r.output).join("\n\n") || aggregationContext,
                  filename: dynamicFilename
                }
              }]);
            }

            if (!finalResult) {
              finalResult = synthHistory[synthHistory.length - 1]?.content || "";
            }

            // Post-processing guard 1: Ensure CSV download link is present and validly formatted in finalResult
            const csvToolMsg = synthHistory.find(m => m.role === "tool" && (m.name === "generate-csv" || m.name === "generate_csv"));
            if (csvToolMsg && csvToolMsg.content) {
              try {
                let parsedCsv = tryParseJson(csvToolMsg.content);
                if (typeof parsedCsv === "string") {
                  parsedCsv = tryParseJson(parsedCsv);
                }
                let rawFilename = parsedCsv?.filename || "export.csv";
                const cleanFilename = String(rawFilename).replace(/\.csv$/i, "").replace(/_csv$/i, "").replace(/_+$/, "") + ".csv";
                let downloadUrl = parsedCsv?.downloadUrl;
                if (!downloadUrl && typeof csvToolMsg.content === "string" && csvToolMsg.content.includes("data:text/csv")) {
                  const match = csvToolMsg.content.match(/data:text\/csv;charset=utf-8;base64,[A-Za-z0-9+/=]+/);
                  if (match) downloadUrl = match[0];
                }
                if (downloadUrl) {
                  const linkMarkdown = `[📥 Download CSV Export: ${cleanFilename}](<${downloadUrl}>)`;
                  // Normalize any existing non-bracketed or broken links
                  if (finalResult.includes(downloadUrl)) {
                    finalResult = finalResult.replace(/\[\s*([^\]]+?)\s*\]\(<?(data:text\/csv[^)>]+)>?\)/gi, `[📥 Download CSV Export: ${cleanFilename}](<$2>)`);
                  } else {
                    const inlineCsvRegex = /(?:^|\n|[ \t]*)(?:[-*•]\s*)?(?:\[\s*)?(?:📥\s*)?Download\s*CSV\s*Export[^\n\r]*(?!\(<data:text\/csv)/gi;
                    if (inlineCsvRegex.test(finalResult)) {
                      finalResult = finalResult.replace(inlineCsvRegex, `\n\n- ${linkMarkdown}\n`);
                    } else {
                      finalResult += `\n\n---\n### 📥 Download CSV Export\n- ${linkMarkdown}\n`;
                    }
                  }
                  // Deduplicate repetitive CSV download lines
                  const csvLinkMatches = finalResult.match(/\[📥 Download CSV Export:[^\]]+\]\(<data:text\/csv[^>]+>\)/g);
                  if (csvLinkMatches && csvLinkMatches.length > 1) {
                    let firstSeen = false;
                    finalResult = finalResult.replace(/\[📥 Download CSV Export:[^\]]+\]\(<data:text\/csv[^>]+>\)/g, (match) => {
                      if (!firstSeen) {
                        firstSeen = true;
                        return match;
                      }
                      return "";
                    });
                  }
                }
              } catch (e) {
                console.error("[PostProcessing CSV Link Error]", e);
              }
            }

            // Post-processing guard 2: Ensure Markdown table is ALWAYS present in finalResult if worker provided records or JSON
            const tableDataRowsCount = (finalResult.match(/\n\|[^\n]+\|/g) || []).length;
            if (tableDataRowsCount < 3) {
              const workerOutputCombined = workerResults.map(r => r.output).join("\n\n");
              const extracted = extractRecordsFromPayload(workerOutputCombined) || extractRecordsFromPayload(aggregationContext);
              if (extracted && extracted.length > 0) {
                const tableHeader = "| Business Name | ⭐ Rating | Review Count | Address | 📞 Contact | 🌐 Website / Maps |\n| --- | --- | --- | --- | --- | --- |";
                const tableRows = extracted.map(r => {
                  const name = sanitizeTableCell(r.name || r.title || r.businessName || "Unnamed");
                  const rating = r.rating != null ? String(r.rating) : "N/A";
                  const reviewCount = r.review_count ?? r.userRatingCount ?? r.reviews_count ?? "N/A";
                  const address = sanitizeTableCell(r.address || r.formattedAddress || "");
                  const phone = sanitizeTableCell(r.phone || "Not listed");
                  const webUrl = r.website || r.websiteUri || r.website_or_map_link;
                  const mapsUrl = r.googleMapsUri || r.map_link;
                  let links = [];
                  if (webUrl && String(webUrl).includes("http")) {
                    const wLink = String(webUrl).split(/[\s|/]+/).find(s => s.startsWith("http"));
                    if (wLink) links.push(`[🌐 Website](${wLink})`);
                  }
                  if (mapsUrl && String(mapsUrl).includes("http")) {
                    const mLink = String(mapsUrl).split(/[\s|/]+/).find(s => s.startsWith("http"));
                    if (mLink) links.push(`[🗺️ Maps](${mLink})`);
                  }
                  const linkCol = links.length > 0 ? links.join(" ") : "-";
                  return `| ${name} | ${rating} | ${reviewCount} | ${address} | ${phone} | ${linkCol} |`;
                }).join("\n");
                const nodeLabels = workerResults.map(r => r.nodeLabel).join(" & ") || "Discovered Records";
                
                if (finalResult.includes("### 📧 Email Dispatch Confirmation")) {
                  finalResult = finalResult.replace("### 📧 Email Dispatch Confirmation", `### 📋 ${nodeLabels}\n\n${tableHeader}\n${tableRows}\n\n### 📧 Email Dispatch Confirmation`);
                } else if (finalResult.includes("### 📥 Download CSV Export")) {
                  finalResult = finalResult.replace("### 📥 Download CSV Export", `### 📋 ${nodeLabels}\n\n${tableHeader}\n${tableRows}\n\n### 📥 Download CSV Export`);
                } else {
                  finalResult = `### 📋 ${nodeLabels}\n\n${tableHeader}\n${tableRows}\n\n${finalResult}`;
                }
              } else if (aggregationContext.includes("|")) {
                const tableLines = aggregationContext.split("\n").filter(l => l.trim().startsWith("|") && l.includes("|"));
                if (tableLines.length >= 3) {
                  if (finalResult.includes("### 📧 Email Dispatch Confirmation")) {
                    finalResult = finalResult.replace("### 📧 Email Dispatch Confirmation", `### 📋 Discovered Records\n\n${tableLines.join("\n")}\n\n### 📧 Email Dispatch Confirmation`);
                  } else {
                    finalResult = `### 📋 Discovered Records\n\n${tableLines.join("\n")}\n\n${finalResult}`;
                  }
                }
              }
            }
          } else {
            // Text-only synthesizer: direct LLM call
            finalResult = await queryLLMDirectly(
              synthesizerNode.modelConfig.provider,
              synthesizerNode.modelConfig.model,
              synthesizerPrompt,
              aggregationContext,
              providerConfigs
            );
          }

          // Stream response in small chunks to simulate live streaming
          sendEvent({ type: "trace", content: `[Synthesizer: ${synthesizerNode.label}] Streaming synthesis output...` });
          const chunkSize = 20;
          for (let i = 0; i < finalResult.length; i += chunkSize) {
            const chunk = finalResult.substring(i, i + chunkSize);
            sendEvent({ content: chunk });
            await new Promise(r => setTimeout(r, 10));
          }
          sendEvent({ type: "trace", content: `[Synthesizer: ${synthesizerNode.label}] Synthesis complete.` });

          if (execThreadId && finalResult) {
            const turnIndex = threadHistory.length;
            await saveThreadMemory(execThreadId, turnIndex, "user", message);
            await saveThreadMemory(execThreadId, turnIndex + 1, "assistant", finalResult);
            sendEvent({ type: "trace", content: `[Thread Memory] Saved turn context to thread memory database.` });
          }

          // Sequential Post-Synthesizer Edge Traversal (isolated per downstream)
          const synthOutgoingEdges = typedEdges.filter(e => e.source === synthesizerNode.id);
          for (const edge of synthOutgoingEdges) {
            const downstreamNode = typedNodes.find(n => n.id === edge.target);
            if (downstreamNode) {
              sendEvent({ type: "trace", content: `[Graph Traversal] Synthesizer routing downstream to node: ${downstreamNode.label}` });
              const taskPrompt = "USER REQUEST:\n" + message + "\n\nSYNTHESIZED REPORT:\n" + finalResult + "\n\nINSTRUCTION: Execute your assigned tool using the parameters extracted dynamically from the user request and report context above.";
              try {
                await runAgentNode(downstreamNode.id, taskPrompt);
              } catch (downstreamErr) {
                const errMsg = downstreamErr instanceof Error ? downstreamErr.message : String(downstreamErr);
                sendEvent({ type: "trace", content: `[Downstream Failure: ${downstreamNode.label}] Error: ${errMsg}` });
              }
            }
          }
        } else {
          const mergedOut = `All Worker Outputs Completed:\n\n` + 
            workerResults.map(r => `### ${r.nodeLabel}\n${r.output}`).join("\n\n");
          sendEvent({ content: mergedOut });
        }

        sendEvent({ type: "done" });
        controller.close();
        } catch (streamErr) {
          const streamErrMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
          try {
            sendEvent({ type: "error", content: `[Stream Error] ${streamErrMsg}` });
            controller.close();
          } catch { /* ignore cascade errors */ }
        }
      }  // closes start function
    });  // closes object literal + ReadableStream

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      }
    });

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errMsg }), { status: 500 });
  }
}
