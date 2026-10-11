import { Pool } from "pg";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface McpToolInputSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: McpToolInputSchema;
  serverId?: string;
}

export interface McpServerConfigEntry {
  url?: string;
  serverUrl?: string;
  transport?: "sse" | "streamable-http" | "http" | "stdio" | "internal";
  type?: "internal" | "external";
  headers?: Record<string, string>;
  active?: boolean;
  disabled?: boolean;
  workspaceEnabled?: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpToolCallResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

export interface LocalToolHandler {
  (toolName: string, args: Record<string, unknown>, pool?: Pool): Promise<McpToolCallResult>;
}

interface CachedClient {
  client: Client;
  serverId: string;
  configHash: string;
  lastUsed: number;
}

export class McpAggregator {
  private static instance: McpAggregator;
  private clientPool: Map<string, CachedClient> = new Map();
  private schemaCache: { tools: McpToolDefinition[]; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 60000; // 1 minute schema TTL
  private localHandler: LocalToolHandler | null = null;
  private localToolDefs: McpToolDefinition[] = [];

  private constructor() {}

  public static getInstance(): McpAggregator {
    if (!McpAggregator.instance) {
      McpAggregator.instance = new McpAggregator();
    }
    return McpAggregator.instance;
  }

  public registerLocalHandler(handler: LocalToolHandler, toolDefs: McpToolDefinition[] = []) {
    this.localHandler = handler;
    this.localToolDefs = toolDefs;
  }

  public invalidateCache(): void {
    this.schemaCache = null;
  }

  public async readServerConfigs(pool: Pool): Promise<Record<string, McpServerConfigEntry>> {
    const servers: Record<string, McpServerConfigEntry> = {};
    try {
      const res = await pool.query(
        'SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1'
      );
      if (res.rows.length > 0 && res.rows[0].designTokens) {
        const tokens = res.rows[0].designTokens;
        const mcpServersVal = tokens.mcpServers;
        if (mcpServersVal) {
          let current: unknown = mcpServersVal;
          if (typeof current === "string") {
            try {
              current = JSON.parse(current);
            } catch {}
          }

          const extract = (node: unknown, depth = 0) => {
            if (!node || typeof node !== "object" || depth > 6) return;
            for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
              if (!val || typeof val !== "object") continue;
              const v = val as McpServerConfigEntry & { mcpServers?: unknown };
              if (v.serverUrl || v.url || v.command || v.type === "internal" || v.transport === "internal") {
                servers[key] = {
                  url: v.url || v.serverUrl,
                  serverUrl: v.serverUrl || v.url,
                  transport: v.transport,
                  type: v.type,
                  headers: v.headers,
                  active: v.active !== false,
                  disabled: v.disabled === true,
                  workspaceEnabled: v.workspaceEnabled !== false,
                  command: v.command,
                  args: v.args,
                  env: v.env,
                };
              } else if (v.mcpServers) {
                extract(v.mcpServers, depth + 1);
              } else {
                extract(v, depth + 1);
              }
            }
          };

          if (current && typeof current === "object" && "mcpServers" in current) {
            extract((current as Record<string, unknown>).mcpServers, 0);
          } else {
            extract(current, 0);
          }
        }
      }
    } catch (err) {
      console.warn("[McpAggregator] Failed to query system_configurations:", err);
    }

    return servers;
  }

  private resolveUrlForEnvironment(rawUrl: string): string {
    let url = rawUrl;
    const isDocker = process.env.DATABASE_URL?.includes("savazai-db");
    if (isDocker && url.includes("localhost")) {
      url = url.replace("localhost", "host.docker.internal");
    }
    return url;
  }

  private async getOrCreateClient(serverId: string, config: McpServerConfigEntry): Promise<Client | null> {
    const targetUrl = config.url || config.serverUrl;
    const requestedTransport = config.transport ? config.transport.toLowerCase() : undefined;

    if (config.type === "internal" || requestedTransport === "internal" || (!targetUrl && requestedTransport !== "stdio")) {
      return null;
    }

    const configHash = JSON.stringify({ targetUrl, requestedTransport, headers: config.headers, command: config.command });
    const existing = this.clientPool.get(serverId);
    if (existing && existing.configHash === configHash) {
      existing.lastUsed = Date.now();
      return existing.client;
    }

    if (existing) {
      try {
        await existing.client.close();
      } catch {}
      this.clientPool.delete(serverId);
    }

    // Connect via Stdio if requested
    if (requestedTransport === "stdio" && config.command) {
      try {
        const client = new Client({ name: `savazai-console-${serverId}`, version: "1.0.0" }, { capabilities: {} });
        const stdioTransport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: { ...(process.env as Record<string, string>), ...(config.env || {}) }
        });
        await client.connect(stdioTransport);
        this.clientPool.set(serverId, { client, serverId, configHash, lastUsed: Date.now() });
        return client;
      } catch (err) {
        console.warn(`[McpAggregator] Stdio connection for "${serverId}" failed:`, err);
        return null;
      }
    }

    if (!targetUrl) return null;
    const resolvedUrl = this.resolveUrlForEnvironment(targetUrl);

    // Try StreamableHTTP first if explicitly configured or as primary modern transport
    const tryStreamable = async (): Promise<Client | null> => {
      try {
        const client = new Client({ name: `savazai-console-${serverId}`, version: "1.0.0" }, { capabilities: {} });
        const transport = new StreamableHTTPClientTransport(new URL(resolvedUrl), {
          requestInit: { headers: config.headers || {} }
        });
        await client.connect(transport);
        return client;
      } catch {
        return null;
      }
    };

    // Try SSE transport
    const trySSE = async (): Promise<Client | null> => {
      try {
        const client = new Client({ name: `savazai-console-${serverId}`, version: "1.0.0" }, { capabilities: {} });
        const transport = new SSEClientTransport(new URL(resolvedUrl), {
          requestInit: { headers: config.headers || {} }
        });
        await client.connect(transport);
        return client;
      } catch {
        return null;
      }
    };

    let client: Client | null = null;
    if (requestedTransport === "sse") {
      client = await trySSE();
      if (!client) client = await tryStreamable();
    } else {
      // Default: try StreamableHTTP first (modern MCP spec), fallback to SSE
      client = await tryStreamable();
      if (!client) client = await trySSE();
    }

    if (client) {
      this.clientPool.set(serverId, { client, serverId, configHash, lastUsed: Date.now() });
      return client;
    }

    console.warn(`[McpAggregator] All SDK transports failed for "${serverId}" (${targetUrl})`);
    return null;
  }

  public async listAllTools(pool: Pool): Promise<{
    servers: { serverId: string; tools: McpToolDefinition[]; workspaceEnabled?: boolean }[];
    allTools: McpToolDefinition[];
  }> {
    const now = Date.now();
    const configs = await this.readServerConfigs(pool);

    if (this.schemaCache && now - this.schemaCache.timestamp < this.CACHE_TTL_MS) {
      const serverMap = new Map<string, McpToolDefinition[]>();
      for (const t of this.schemaCache.tools) {
        const sid = t.serverId || "default";
        if (!serverMap.has(sid)) serverMap.set(sid, []);
        serverMap.get(sid)!.push(t);
      }
      return {
        servers: Array.from(serverMap.entries()).map(([serverId, tools]) => ({
          serverId,
          tools,
          workspaceEnabled: configs[serverId]?.workspaceEnabled !== false,
        })),
        allTools: this.schemaCache.tools
      };
    }

    const serversResult: { serverId: string; tools: McpToolDefinition[]; workspaceEnabled?: boolean }[] = [];
    const allTools: McpToolDefinition[] = [];

    // 1. Add Local / Internal Tools ONLY if configured as an internal server in system_configurations
    const internalServerEntry = Object.entries(configs).find(
      ([, cfg]) => cfg.type === "internal" || cfg.transport === "internal"
    );

    if (internalServerEntry && this.localToolDefs.length > 0) {
      const [internalServerId, internalCfg] = internalServerEntry;
      const localToolsWithServer = this.localToolDefs.map(t => ({
        ...t,
        serverId: internalServerId
      }));
      serversResult.push({
        serverId: internalServerId,
        tools: localToolsWithServer,
        workspaceEnabled: internalCfg.workspaceEnabled !== false,
      });
      allTools.push(...localToolsWithServer);
    }

    // 2. Query configured external servers in parallel with resilient timeouts
    const serverEntries = Object.entries(configs).filter(
      ([, cfg]) => cfg.type !== "internal" && cfg.transport !== "internal" && cfg.active !== false && cfg.disabled !== true
    );

    const queryPromises = serverEntries.map(async ([serverId, cfg]) => {
      const targetUrl = cfg.url || cfg.serverUrl;

      // Case A: SDK-supported transports (StreamableHTTP, SSE, Stdio)
      try {
        const client = await Promise.race([
          this.getOrCreateClient(serverId, cfg),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
        ]);

        if (client) {
          const listRes = await Promise.race([
            client.listTools(),
            new Promise<{ tools: [] }>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
          ]);

          const tools: McpToolDefinition[] = (listRes?.tools || []).map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: (t.inputSchema as McpToolInputSchema) || { type: "object", properties: {} },
            serverId
          }));

          if (tools.length > 0) {
            return { serverId, tools, workspaceEnabled: cfg.workspaceEnabled !== false };
          }
        }
      } catch (sdkErr) {
        console.warn(`[McpAggregator] SDK listTools failed for server ${serverId}:`, sdkErr);
      }

      // Case B: Direct JSON-RPC HTTP POST fallback (handles standard HTTP endpoints)
      if (targetUrl) {
        try {
          const resolvedUrl = this.resolveUrlForEnvironment(targetUrl);
          const abortCtrl = new AbortController();
          const tId = setTimeout(() => abortCtrl.abort(), 6000);

          const res = await fetch(resolvedUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(cfg.headers || {})
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: `list-${serverId}-${Date.now()}`,
              method: "tools/list",
              params: {}
            }),
            signal: abortCtrl.signal
          });
          clearTimeout(tId);

          if (res.ok) {
            const data = await res.json() as { result?: { tools?: McpToolDefinition[] } };
            const fetched = data?.result?.tools || [];
            const mappedTools = fetched.map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema || { type: "object", properties: {} },
              serverId
            }));
            return { serverId, tools: mappedTools, workspaceEnabled: cfg.workspaceEnabled !== false };
          }
        } catch (httpErr) {
          console.warn(`[McpAggregator] HTTP JSON-RPC fallback failed for ${serverId}:`, httpErr);
        }
      }

      // Zero-hardcoding: return empty tools array instead of a dummy synthetic tool
      return {
        serverId,
        tools: [],
        workspaceEnabled: cfg.workspaceEnabled !== false
      };
    });

    const settled = await Promise.allSettled(queryPromises);
    for (const res of settled) {
      if (res.status === "fulfilled" && res.value) {
        serversResult.push(res.value);
        allTools.push(...res.value.tools);
      }
    }

    this.schemaCache = { tools: allTools, timestamp: now };
    return { servers: serversResult, allTools };
  }

  public async executeTool(
    serverId: string | undefined,
    toolName: string,
    args: Record<string, unknown>,
    pool: Pool
  ): Promise<McpToolCallResult> {
    const configs = await this.readServerConfigs(pool);

    // 1. If serverId is unspecified, determine which configured server owns this tool
    let targetServerId = serverId;
    if (!targetServerId || !configs[targetServerId]) {
      // Check cached tool definitions
      const cached = this.schemaCache?.tools.find(t => t.name === toolName);
      if (cached?.serverId && configs[cached.serverId]) {
        targetServerId = cached.serverId;
      } else {
        // Match against configured server names/keys
        for (const key of Object.keys(configs)) {
          if (toolName.toLowerCase().startsWith(key.toLowerCase().replace(/[^a-z0-9]/g, ""))) {
            targetServerId = key;
            break;
          }
        }
      }

      // If still unresolved, check if local tool definitions have it and an internal server exists
      if (!targetServerId) {
        const isLocal = this.localToolDefs.some(t => t.name === toolName);
        if (isLocal) {
          const internalEntry = Object.entries(configs).find(
            ([, c]) => c.type === "internal" || c.transport === "internal"
          );
          if (internalEntry) {
            targetServerId = internalEntry[0];
          }
        }
      }
    }

    // 2. Internal Handler execution if server type is internal
    const isTargetInternal = Boolean(
      targetServerId &&
      (configs[targetServerId]?.type === "internal" || configs[targetServerId]?.transport === "internal")
    );

    if (isTargetInternal) {
      if (this.localHandler) {
        return this.localHandler(toolName, args, pool);
      }
      return {
        content: [{ type: "text", text: `Tool ${toolName} has no registered local handler` }],
        isError: true
      };
    }

    // 2. Remote Server execution
    const serverCfg = configs[targetServerId!];
    if (!serverCfg) {
      return {
        content: [{ type: "text", text: `Unknown MCP server: ${targetServerId}` }],
        isError: true
      };
    }

    // Attempt SDK client call
    try {
      const client = await this.getOrCreateClient(targetServerId!, serverCfg);
      if (client) {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout calling tool ${toolName} on ${targetServerId}`)), 30000)
        );

        const callResult = await Promise.race([
          client.callTool({
            name: toolName,
            arguments: args
          }),
          timeoutPromise
        ]);

        if (callResult) {
          const contents = Array.isArray(callResult.content)
            ? callResult.content.map(c => {
                if (typeof c === "object" && c !== null && "text" in c) {
                  return { type: (c as { type?: string }).type || "text", text: String((c as { text?: unknown }).text) };
                }
                return { type: "text", text: JSON.stringify(c) };
              })
            : [{ type: "text", text: JSON.stringify(callResult) }];

          return {
            content: contents,
            isError: callResult.isError === true
          };
        }
      }
    } catch (sdkErr) {
      console.warn(`[McpAggregator] SDK callTool failed for ${toolName} on ${targetServerId}:`, sdkErr);
    }

    // Fallback: Direct JSON-RPC POST call
    const targetUrl = serverCfg.url || serverCfg.serverUrl;
    if (targetUrl) {
      try {
        const resolvedUrl = this.resolveUrlForEnvironment(targetUrl);
        const abortCtrl = new AbortController();
        const timeoutId = setTimeout(() => abortCtrl.abort(), 30000);

        const res = await fetch(resolvedUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(serverCfg.headers || {})
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: `call-${toolName}-${Date.now()}`,
            method: "tools/call",
            params: {
              name: toolName,
              arguments: args
            }
          }),
          signal: abortCtrl.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json() as Record<string, unknown>;
          if (data && data.error) {
            const errStr = typeof data.error === "object" && data.error !== null
              ? String((data.error as Record<string, unknown>).message || JSON.stringify(data.error))
              : String(data.error);
            return {
              content: [{ type: "text", text: errStr }],
              isError: true
            };
          }

          if (data && data.result !== undefined) {
            const r = data.result as Record<string, unknown>;
            if (Array.isArray(r.content)) {
              return {
                content: (r.content as Record<string, unknown>[]).map(c => ({
                  type: String(c.type || "text"),
                  text: String(c.text || JSON.stringify(c))
                })),
                isError: r.isError === true
              };
            }
            return {
              content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r) }],
              isError: r.isError === true
            };
          }
        }
      } catch (httpErr) {
        const errMsg = httpErr instanceof Error ? httpErr.message : String(httpErr);
        return {
          content: [{ type: "text", text: `Remote MCP server error (${targetServerId}): ${errMsg}` }],
          isError: true
        };
      }
    }

    return {
      content: [{ type: "text", text: `Failed to execute ${toolName} on server ${targetServerId}` }],
      isError: true
    };
  }
}
