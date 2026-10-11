import { z } from "zod";
import { randomUUID } from "node:crypto";

export const ToolCategorySchema = z.string().default("mcp");

export const ToolReferenceSchema = z.object({
  id: z.string().default(() => randomUUID()),
  name: z.string().min(1),
  category: z.string().default("mcp"),
  mcpServerId: z.string().optional(),
  config: z.record(z.string(), z.any()).optional(),
}).passthrough();

export type ToolReference = z.infer<typeof ToolReferenceSchema>;

export const ModelConfigSchema = z.preprocess(
  (val) => (val === null || val === undefined ? { provider: "openai", model: "gpt-4o-mini", temperature: 0.2 } : val),
  z.object({
    provider: z.string().default("openai"),
    model: z.string().default("gpt-4o-mini"),
    temperature: z.number().min(0).max(2).default(0.2),
    maxTokens: z.number().optional(),
  }).optional().default({
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.2,
  })
);

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const AgentNodeSchema = z.object({
  id: z.string().default(() => randomUUID()),
  label: z.string().min(1),
  roleTemplate: z.string().default("worker"),
  systemPrompt: z.string().default(""),
  modelConfig: ModelConfigSchema,
  tools: z.array(ToolReferenceSchema).default([]),
  ragNamespace: z.string().optional(),
  embedModel: z.string().optional(),
  hitlPolicy: z.enum(["always", "on_delete", "on_mutate", "never"]).optional(),
  memoryCheckpoint: z.boolean().default(true),
  kvPersistence: z.boolean().default(false),
  piiMaskingOverride: z.string().optional(),
  parentId: z.string().optional(),
  collapsed: z.boolean().optional(),
  customColor: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  data: z.record(z.string(), z.any()).optional(),
}).passthrough();

export type AgentNode = z.infer<typeof AgentNodeSchema>;

export const CanvasEdgeSchema = z.object({
  id: z.string().default(() => randomUUID()),
  source: z.string().min(1),
  target: z.string().min(1),
  conditionExpression: z.string().optional(),
}).passthrough();

export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;

export const CanvasDefinitionSchema = z.object({
  id: z.string().default(() => randomUUID()),
  name: z.string().min(1).default("Untitled Agentflow"),
  version: z.string().default("1.0.0"),
  workflowType: z.enum(["interactive", "scheduled"]).default("interactive"),
  cronSchedule: z.string().optional(),
  scheduledPrompt: z.string().optional(),
  nodes: z.array(AgentNodeSchema).min(1),
  edges: z.array(CanvasEdgeSchema).default([]),
  globalSystemPrompt: z.string().optional(),
}).passthrough();

export type CanvasDefinition = z.infer<typeof CanvasDefinitionSchema>;
