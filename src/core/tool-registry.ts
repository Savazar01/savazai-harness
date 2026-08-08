/**
 * @module core/tool-registry
 * @description Unified tool registry merging native system tools (from src/skills/) and
 * external MCP-server-hosted tools into a single resolution layer. Provides OpenAI
 * function-calling format export for LLM binding.
 */

import { z } from "zod";
import type { ToolReference } from "./schemas.js";
import { loadSkills, type SkillTool } from "../utils/skills-loader.js";
import { McpHttpClient } from "../mcp/client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnifiedTool {
  /** Tool name as used in function-calling. */
  name: string;
  /** Human-readable description for the LLM. */
  description: string;
  /** Whether this tool is native or from an MCP server. */
  category: "native" | "mcp";
  /** MCP server identifier (only set when category === 'mcp'). */
  mcpServerId?: string;
  /** Zod schema for parameter validation. */
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  /** Async execution handler. */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// ToolRegistry
// ---------------------------------------------------------------------------

export class ToolRegistry {
  private tools: Map<string, UnifiedTool> = new Map();
  private mcpClients: Map<string, McpHttpClient> = new Map();

  /**
   * Register a native tool with a Zod schema and async handler.
   */
  registerNative(
    name: string,
    description: string,
    schema: z.ZodObject<Record<string, z.ZodTypeAny>>,
    handler: (args: Record<string, unknown>) => Promise<unknown>,
  ): void {
    this.tools.set(name, {
      name,
      description,
      category: "native",
      schema,
      execute: handler,
    });
  }

  /**
   * Register MCP-discovered tools under a server namespace.
   * MCP tools are keyed as 'serverId::toolName' for collision avoidance.
   */
  registerMcp(
    serverId: string,
    tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>,
  ): void {
    for (const tool of tools) {
      const qualifiedName = `${serverId}::${tool.name}`;

      // Build a Zod schema from the MCP tool's inputSchema (JSON Schema)
      const schema = this.jsonSchemaToZod(tool.inputSchema);

      // Create an MCP client for this server if we haven't already
      let client = this.mcpClients.get(serverId);
      if (!client) {
        const endpoint = process.env[`MCP_${serverId.toUpperCase()}_URL`]
          || process.env.MCP_CRAWLER_URL
          || "http://localhost:21123/mcp/sse";
        client = new McpHttpClient(endpoint);
        this.mcpClients.set(serverId, client);
      }

      const mcpClient = client;

      this.tools.set(qualifiedName, {
        name: qualifiedName,
        description: tool.description ?? `MCP tool: ${tool.name}`,
        category: "mcp",
        mcpServerId: serverId,
        schema,
        execute: async (args: Record<string, unknown>) => {
          return mcpClient.callTool(tool.name, args);
        },
      });
    }
  }

  /**
   * Resolve a ToolReference to its UnifiedTool handler.
   */
  get(toolRef: ToolReference): UnifiedTool | undefined {
    if (toolRef.category === "mcp" && toolRef.mcpServerId) {
      return this.tools.get(`${toolRef.mcpServerId}::${toolRef.name}`);
    }
    return this.tools.get(toolRef.name);
  }

  /**
   * Resolve a tool by its direct name or qualified name.
   */
  getByName(name: string): UnifiedTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Return all registered tools.
   */
  listAll(): UnifiedTool[] {
    return [...this.tools.values()];
  }

  /**
   * Convert the full registry to OpenAI function-calling format for LLM binding.
   */
  toOpenAIFunctions(): object[] {
    return this.listAll().map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: this.zodToJsonSchema(tool.schema),
      },
    }));
  }

  /**
   * Bootstrap native tools from the skills loader.
   * Reads all .md skill files from src/skills/ and registers them.
   */
  bootstrapNativeSkills(): void {
    const skills: SkillTool[] = loadSkills();
    for (const skill of skills) {
      this.tools.set(skill.name, {
        name: skill.name,
        description: skill.description,
        category: "native",
        schema: skill.schema,
        execute: skill.execute,
      });
    }
    console.log(`[ToolRegistry] Bootstrapped ${skills.length} native skill tools.`);
  }

  /**
   * Discover and register tools from an MCP server endpoint.
   */
  async discoverMcpTools(serverId: string, endpoint?: string): Promise<void> {
    const url = endpoint
      ?? process.env[`MCP_${serverId.toUpperCase()}_URL`]
      ?? "http://localhost:21123/mcp/sse";
    const client = new McpHttpClient(url);
    this.mcpClients.set(serverId, client);

    try {
      const tools = await client.listTools();
      this.registerMcp(serverId, tools);
      console.log(`[ToolRegistry] Discovered ${tools.length} MCP tools from server '${serverId}'.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ToolRegistry] Failed to discover MCP tools from '${serverId}': ${msg}`);
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Convert a JSON Schema object to a simple Zod schema.
   * Handles the flat parameter schemas typical of MCP tool definitions.
   */
  private jsonSchemaToZod(
    jsonSchema?: Record<string, unknown>,
  ): z.ZodObject<Record<string, z.ZodTypeAny>> {
    if (!jsonSchema || !jsonSchema.properties) {
      return z.object({});
    }

    const properties = jsonSchema.properties as Record<string, Record<string, unknown>>;
    const required = new Set<string>(
      Array.isArray(jsonSchema.required) ? (jsonSchema.required as string[]) : [],
    );

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(properties)) {
      let zodType: z.ZodTypeAny;
      switch (prop.type) {
        case "number":
        case "integer":
          zodType = z.number();
          break;
        case "boolean":
          zodType = z.boolean();
          break;
        case "array":
          zodType = z.array(z.any());
          break;
        case "object":
          zodType = z.record(z.string(), z.any());
          break;
        default:
          zodType = z.string();
      }

      if (typeof prop.description === "string") {
        zodType = zodType.describe(prop.description);
      }

      shape[key] = required.has(key) ? zodType : zodType.optional();
    }

    return z.object(shape);
  }

  /**
   * Convert a Zod object schema to a minimal JSON Schema for OpenAI function calling.
   */
  private zodToJsonSchema(schema: z.ZodObject<Record<string, z.ZodTypeAny>>): object {
    const shape = schema.shape;
    const properties: Record<string, object> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodTypeAny;
      const isOptional = zodValue.isOptional();
      const innerType = isOptional && "unwrap" in zodValue ? (zodValue as any).unwrap() : zodValue;

      let jsonType = "string";
      if (innerType instanceof z.ZodNumber) jsonType = "number";
      else if (innerType instanceof z.ZodBoolean) jsonType = "boolean";
      else if (innerType instanceof z.ZodArray) jsonType = "array";
      else if (innerType instanceof z.ZodObject || innerType instanceof z.ZodRecord)
        jsonType = "object";

      const prop: Record<string, unknown> = { type: jsonType };
      if (innerType.description) prop.description = innerType.description;

      properties[key] = prop;
      if (!isOptional) required.push(key);
    }

    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }
}
