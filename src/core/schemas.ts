import { z } from "zod";
import { randomUUID } from "node:crypto";

export const ToolReferenceSchema = z.object({
  id: z.string().default(() => randomUUID()),
  name: z.string().min(1),
  category: z.enum(["native", "mcp"]),
  mcpServerId: z.string().optional(),
  config: z.record(z.string(), z.any()).optional(),
});

export type ToolReference = z.infer<typeof ToolReferenceSchema>;

export const ModelConfigSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.7),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const AgentNodeSchema = z.object({
  id: z.string().default(() => randomUUID()),
  label: z.string().min(1),
  roleTemplate: z.string().default("worker"),
  systemPrompt: z.string().default(""),
  modelConfig: ModelConfigSchema,
  tools: z.array(ToolReferenceSchema).default([]),
  ragNamespace: z.string().optional(),
  hitlPolicy: z.enum(["always", "on_delete", "on_mutate", "never"]).optional(),
  memoryCheckpoint: z.boolean().default(true),
  kvPersistence: z.boolean().default(false),
  piiMaskingOverride: z.string().optional(),
});

export type AgentNode = z.infer<typeof AgentNodeSchema>;

export const CanvasEdgeSchema = z.object({
  id: z.string().default(() => randomUUID()),
  source: z.string().min(1),
  target: z.string().min(1),
  conditionExpression: z.string().optional(),
});

export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;

export const CanvasDefinitionSchema = z.object({
  id: z.string().default(() => randomUUID()),
  name: z.string().min(1),
  version: z.string().default("1.0.0"),
  workflowType: z.enum(["interactive", "scheduled"]).default("interactive"),
  cronSchedule: z.string().optional(),
  scheduledPrompt: z.string().optional(),
  nodes: z.array(AgentNodeSchema).min(1),
  edges: z.array(CanvasEdgeSchema),
  globalSystemPrompt: z.string().optional(),
});

export type CanvasDefinition = z.infer<typeof CanvasDefinitionSchema>;
