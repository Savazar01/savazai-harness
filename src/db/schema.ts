import {
  pgTable,
  serial,
  text,
  jsonb,
  boolean,
  uuid,
  timestamp,
  integer,
  customType,
  varchar,
  doublePrecision,
} from "drizzle-orm/pg-core";

export const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector(1536)",
  toDriver: (value: number[]) => `[${value.join(",")}]`,
  fromDriver: (value: string) => JSON.parse(value),
});

export type ModelConfig = {
  providerType: string;
  baseUrl?: string;
  modelName?: string;
  apiKey?: string;
  backupProviderType?: string;
  backupBaseUrl?: string;
  backupModelName?: string;
  backupApiKey?: string;
} | null;

export const connectedApps = pgTable("connected_apps", {
  id: serial("id").primaryKey(),
  appName: text("app_name").notNull().unique(),
  mcpEndpointUrl: text("mcp_endpoint_url"),
  bearerTokenHash: text("bearer_token_hash"),
  modelConfig: jsonb("model_config").$type<ModelConfig>().default(null),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const autonomousAgents = pgTable(
  "autonomous_agents",
  {
    id: serial("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => connectedApps.id),
    agentName: text("agent_name").notNull(),
    systemPrompt: text("system_prompt"),
    allowedMcpTools: jsonb("allowed_mcp_tools").$type<string[]>().default([]),
    isCoreAgent: boolean("is_core_agent").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const skillEmbeddings = pgTable("skill_embeddings", {
  id: serial("id").primaryKey(),
  skillName: text("skill_name").notNull().unique(),
  description: text("description").notNull(),
  embedding: vector("embedding"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentSessionMemory = pgTable(
  "agent_session_memory",
  {
    sessionId: uuid("session_id").defaultRandom().primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => connectedApps.id),
    role: text("role").notNull(),
    rawContent: text("raw_content"),
    maskedContent: text("masked_content"),
    embedding: vector("embedding"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const systemConfigurations = pgTable("system_configurations", {
  id: uuid("id").defaultRandom().primaryKey(),
  appTitle: varchar("app_title", { length: 255 }).notNull(),
  brandLogoUrl: text("brand_logo_url").default("https://savazar.com/wp-content/uploads/2023/10/cropped-Transparent_Image_2-300x100.png"),
  designTokens: jsonb("design_tokens").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const telemetryLogs = pgTable("telemetry_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  chatId: uuid("chat_id"), // ties telemetry to individual chat threads
  provider: text("provider"),
  modelName: text("model_name"),
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  reasoningTokens: integer("reasoning_tokens").default(0),
  executionLatencyMs: integer("execution_latency_ms").default(0),
  executedMcpTools: jsonb("executed_mcp_tools").$type<{ toolName: string; latencyMs: number; statusCode: number; estimatedToolCost?: number }[]>().default([]),
  transactionCost: doublePrecision("transaction_cost").default(0.0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
