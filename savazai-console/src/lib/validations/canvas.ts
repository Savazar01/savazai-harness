import { z } from "zod";

/**
 * Flexible, open schema for tool categories supporting native, mcp, custom, open, api, etc.
 */
export const toolCategorySchema = z.string().default("mcp");

export const toolReferenceSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  category: toolCategorySchema,
  mcpServerId: z.string().optional(),
  config: z.record(z.string(), z.any()).optional(),
}).passthrough();

export type ToolReferenceType = z.infer<typeof toolReferenceSchema>;

export const modelConfigSchema = z.preprocess(
  (val) => (val === null || val === undefined ? { provider: "openai", model: "gpt-4o-mini", temperature: 0.2 } : val),
  z.object({
    provider: z.string().default("openai"),
    model: z.string().default("gpt-4o-mini"),
    temperature: z.number().default(0.2),
    maxTokens: z.number().optional(),
  }).optional().default({
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.2,
  })
);

export type ModelConfigType = z.infer<typeof modelConfigSchema>;

export const agentNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().default("Agent"),
  roleTemplate: z.string().default("worker"),
  systemPrompt: z.string().optional().default(""),
  modelConfig: modelConfigSchema,
  tools: z.array(toolReferenceSchema).optional().default([]),
  ragNamespace: z.string().optional(),
  embedModel: z.string().optional(),
  hitlPolicy: z.enum(["always", "on_delete", "on_mutate", "never"]).optional(),
  memoryCheckpoint: z.boolean().optional().default(true),
  kvPersistence: z.boolean().optional().default(false),
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

export type AgentNodeType = z.infer<typeof agentNodeSchema>;

export const canvasEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  conditionExpression: z.string().optional(),
}).passthrough();

export type CanvasEdgeType = z.infer<typeof canvasEdgeSchema>;

export const canvasDefinitionSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional().default("Untitled Agentflow"),
  version: z.string().optional().default("1.0.0"),
  workflowType: z.enum(["interactive", "scheduled"]).optional().default("interactive"),
  cronSchedule: z.string().optional(),
  scheduledPrompt: z.string().optional(),
  nodes: z.array(agentNodeSchema).min(1),
  edges: z.array(canvasEdgeSchema).optional().default([]),
  globalSystemPrompt: z.string().optional(),
}).passthrough();

export type CanvasDefinitionType = z.infer<typeof canvasDefinitionSchema>;
