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
  unique,
  index,
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

export const agentflows = pgTable("agentflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  workspaceMode: text("workspace_mode").default("interactive").notNull(),
  status: text("status").default("draft").notNull(),
  canvasDefinition: jsonb("canvas_definition").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

export const demoRequests = pgTable("demo_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  company: text("company").notNull(),
  industry: text("industry").notNull(),
  timeline: text("timeline").notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Enterprise Zero-Trust RBAC & Onboarding Schema ──

export type AccountStatus = "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "REJECTED";

export const roles = pgTable("role", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isSystem: boolean("isSystem").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  image: text("image"),
  location: text("location"),
  role: text("role").default("user").notNull(),
  status: text("status").$type<AccountStatus>().default("PENDING_APPROVAL").notNull(),
  mustResetPassword: boolean("mustResetPassword").default(true).notNull(),
  roleId: text("roleId").references(() => roles.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const rolePermissions = pgTable(
  "role_permission",
  {
    id: text("id").primaryKey(),
    roleId: text("roleId")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    action: text("action").notNull(),
  },
  (t) => [unique("role_permission_unique").on(t.roleId, t.resource, t.action)]
);

export const userAssignedRoles = pgTable(
  "user_assigned_role",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: text("roleId")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("user_assigned_role_unique").on(t.userId, t.roleId)]
);

export const userPermissions = pgTable(
  "user_permission",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    action: text("action").notNull(),
    granted: boolean("granted").default(true).notNull(),
  },
  (t) => [unique("user_permission_unique").on(t.userId, t.resource, t.action)]
);

export const verificationTokens = pgTable(
  "verification_token",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    purpose: text("purpose").default("onboarding").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("verification_token_identifier_idx").on(t.identifier)]
);

export const emailAuditLogs = pgTable(
  "email_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    purpose: text("purpose").notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("email_audit_recipient_idx").on(t.recipient),
    index("email_audit_created_at_idx").on(t.createdAt),
  ]
);

export interface OrganizationalData {
  companyName: string;
  taxIdOrRegistration?: string;
  country: string;              // ISO-3166-1 alpha-2 (e.g., "US", "IN", "GB", "DE")
  streetAddress: string;
  suiteOrUnit?: string;
  city: string;
  stateOrRegion: string;
  postalCode: string;
  timezone: string;             // IANA (e.g., "Asia/Kolkata", "America/New_York")
  defaultLanguage: string;      // ISO 639-1 (e.g., "en", "hi", "de")
  corporatePhone: string;
  corporateEmail: string;
  websiteUrl?: string;
}

export const emailTemplates = pgTable("email_templates", {
  id: text("id").primaryKey(), // UUID
  templateKey: varchar("template_key", { length: 128 }).notNull().unique(), // e.g., "hitl_approval_request"
  name: varchar("name", { length: 256 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(), // "approval", "notification", "workflow_result", "system_alert"
  description: text("description"),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyMarkdown: text("body_markdown"),
  supportedVariables: jsonb("supported_variables").$type<string[]>(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const systemAuditLogs = pgTable(
  "system_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id"),
    userEmail: text("user_email"),
    category: varchar("category", { length: 64 }).default("SYSTEM"),
    action: varchar("action", { length: 128 }).notNull(),
    resource: varchar("resource", { length: 128 }).notNull(),
    targetId: text("target_id"),
    targetName: text("target_name"),
    details: jsonb("details").$type<Record<string, any>>().default({}),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("system_audit_action_idx").on(t.action),
    index("system_audit_resource_idx").on(t.resource),
    index("system_audit_category_idx").on(t.category),
    index("system_audit_created_at_idx").on(t.createdAt),
  ]
);

export const assetRevisions = pgTable("asset_revisions", {
  id: text("id").primaryKey(),
  assetType: varchar("asset_type", { length: 32 }).notNull(), // 'skill' | 'okf_concept'
  assetKey: varchar("asset_key", { length: 128 }).notNull(),
  version: varchar("version", { length: 32 }).notNull(), // 'v1.0.0', 'v1.1.0'
  content: text("content").notNull(),
  metadataSnapshot: jsonb("metadata_snapshot").$type<Record<string, any>>().default({}),
  authorId: text("author_id").notNull(),
  authorEmail: text("author_email").notNull(),
  changeSummary: text("change_summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("asset_revisions_key_idx").on(t.assetKey),
  index("asset_revisions_type_idx").on(t.assetType),
  index("asset_revisions_created_at_idx").on(t.createdAt),
]);

export const promptRevisions = pgTable("prompt_revisions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  agentflowId: text("agentflow_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  authorId: text("author_id").notNull(),
  authorEmail: text("author_email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("prompt_revisions_agent_idx").on(t.agentId),
  index("prompt_revisions_flow_idx").on(t.agentflowId),
  index("prompt_revisions_created_at_idx").on(t.createdAt),
]);



