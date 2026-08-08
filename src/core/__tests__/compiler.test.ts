/**
 * @module core/__tests__/compiler.test
 * @description Automated unit tests for the canvas-to-LangGraph compiler.
 * Tests schema validation, graph compilation, mock invocation, and
 * GovernanceMaskingGateway PII masking/unmasking pass.
 *
 * Run with: npx tsx src/core/__tests__/compiler.test.ts
 * All temporary test artifacts are written to ./logs/ per AGENTS.md Rule 9.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";

import {
  CanvasDefinitionSchema,
  ToolReferenceSchema,
  AgentNodeSchema,
  CanvasEdgeSchema,
  type CanvasDefinition,
} from "../schemas.js";
import { ToolRegistry } from "../tool-registry.js";
import { GovernanceMaskingGateway } from "../../governance/masking.js";
import { compileCanvasToGraph, type NodeHandlerOverride } from "../compiler.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Ensure logs directory exists (AGENTS.md Rule 9)
// ---------------------------------------------------------------------------

const LOGS_DIR = resolve(process.cwd(), "logs");
if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}
const TEST_LOG_PATH = resolve(LOGS_DIR, "compiler-test-output.log");

function log(message: string): void {
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  writeFileSync(TEST_LOG_PATH, entry, { flag: "a", encoding: "utf-8" });
}

// ---------------------------------------------------------------------------
// Test Data: Sample Canvas Definition
// ---------------------------------------------------------------------------

function createSampleCanvas(): CanvasDefinition {
  return CanvasDefinitionSchema.parse({
    name: "Test Workflow",
    version: "1.0.0",
    globalSystemPrompt: "You are a helpful test assistant.",
    nodes: [
      {
        id: "supervisor-node-1",
        label: "Primary Supervisor",
        roleTemplate: "supervisor",
        systemPrompt: "Process user queries and delegate to worker agents.",
        modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0.3 },
        tools: [
          { name: "mock-tool", category: "native" },
        ],
        memoryCheckpoint: true,
        kvPersistence: false,
      },
      {
        id: "worker-node-1",
        label: "Data Worker",
        roleTemplate: "worker",
        systemPrompt: "",
        modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0 },
        tools: [
          { name: "mock-tool", category: "native" },
        ],
        memoryCheckpoint: true,
        kvPersistence: false,
      },
      {
        id: "synthesizer-node-1",
        label: "Response Synthesizer",
        roleTemplate: "synthesizer",
        systemPrompt: "Aggregate outputs into cohesive response.",
        modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0 },
        tools: [],
        memoryCheckpoint: true,
        kvPersistence: false,
        hitlPolicy: "on_delete",
      },
    ],
    edges: [
      { source: "supervisor-node-1", target: "worker-node-1" },
      { source: "worker-node-1", target: "synthesizer-node-1" },
    ],
  });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Schema Validation", () => {
  it("should validate a valid ToolReference", () => {
    const result = ToolReferenceSchema.parse({
      name: "brave-search",
      category: "native",
    });
    assert.equal(result.name, "brave-search");
    assert.equal(result.category, "native");
    assert.ok(result.id, "Auto-generated UUID should be present");
    log("✅ ToolReference validation passed");
  });

  it("should validate an MCP ToolReference", () => {
    const result = ToolReferenceSchema.parse({
      name: "list_guests",
      category: "mcp",
      mcpServerId: "wedplanai",
    });
    assert.equal(result.category, "mcp");
    assert.equal(result.mcpServerId, "wedplanai");
    log("✅ MCP ToolReference validation passed");
  });

  it("should reject an invalid ToolReference (empty name)", () => {
    assert.throws(() => {
      ToolReferenceSchema.parse({ name: "", category: "native" });
    });
    log("✅ Invalid ToolReference correctly rejected");
  });

  it("should validate a complete AgentNode", () => {
    const result = AgentNodeSchema.parse({
      label: "Test Node",
      roleTemplate: "worker",
      modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0.5 },
    });
    assert.equal(result.roleTemplate, "worker");
    assert.equal(result.modelConfig.temperature, 0.5);
    assert.deepEqual(result.tools, []);
    assert.equal(result.memoryCheckpoint, true);
    log("✅ AgentNode validation passed");
  });

  it("should validate a CanvasEdge", () => {
    const result = CanvasEdgeSchema.parse({
      source: "node-a",
      target: "node-b",
      conditionExpression: "state.category === 'search'",
    });
    assert.equal(result.source, "node-a");
    assert.ok(result.conditionExpression);
    log("✅ CanvasEdge validation passed");
  });

  it("should validate a full CanvasDefinition", () => {
    const canvas = createSampleCanvas();
    assert.equal(canvas.name, "Test Workflow");
    assert.equal(canvas.nodes.length, 3);
    assert.equal(canvas.edges.length, 2);
    log("✅ Full CanvasDefinition validation passed");
  });

  it("should reject a CanvasDefinition with no nodes", () => {
    assert.throws(() => {
      CanvasDefinitionSchema.parse({
        name: "Empty Canvas",
        nodes: [],
        edges: [],
      });
    });
    log("✅ Empty CanvasDefinition correctly rejected");
  });
});

describe("GovernanceMaskingGateway", () => {
  let gateway: GovernanceMaskingGateway;

  before(() => {
    gateway = new GovernanceMaskingGateway(undefined, LOGS_DIR);
  });

  it("should mask email addresses with SHA-256 tokens", () => {
    const input = "Contact me at john.doe@example.com for details.";
    const result = gateway.maskPayload(input);

    assert.ok(!result.maskedText.includes("john.doe@example.com"), "Email should be masked");
    assert.ok(result.maskedText.includes("[GOV_EMAIL_"), "Should contain GOV_EMAIL token");
    assert.equal(result.tokenMap.size, 1);
    assert.ok(result.categories.some((c) => c.type === "email" && c.count === 1));
    log(`✅ Email masking passed: ${result.maskedText}`);
  });

  it("should mask phone numbers", () => {
    const input = "Call me at 555-123-4567.";
    const result = gateway.maskPayload(input);

    assert.ok(!result.maskedText.includes("555-123-4567"), "Phone should be masked");
    assert.ok(result.categories.some((c) => c.type === "phone"));
    log("✅ Phone masking passed");
  });

  it("should mask SSN", () => {
    const input = "My SSN is 123-45-6789.";
    const result = gateway.maskPayload(input);

    assert.ok(!result.maskedText.includes("123-45-6789"), "SSN should be masked");
    log("✅ SSN masking passed");
  });

  it("should unmask correctly using the token map", () => {
    const input = "Email: admin@savazar.com and phone: 555-987-6543.";
    const maskResult = gateway.maskPayload(input);
    const unmasked = gateway.unmaskPayload(maskResult.maskedText, maskResult.tokenMap);

    assert.equal(unmasked, input, "Unmasked text should match original input exactly");
    log("✅ Unmask round-trip passed");
  });

  it("should support custom pattern registration", () => {
    const customGateway = new GovernanceMaskingGateway(undefined, LOGS_DIR);
    customGateway.addPattern(/CUSTOM-\d{4}/g, "custom_id");

    const input = "Reference: CUSTOM-4829";
    const result = customGateway.maskPayload(input);

    assert.ok(!result.maskedText.includes("CUSTOM-4829"));
    assert.ok(result.categories.some((c) => c.type === "custom_id"));
    log("✅ Custom pattern registration passed");
  });

  it("should produce category analytics", () => {
    const input = "Email alice@test.com and bob@test.com, phone 111-222-3333.";
    const result = gateway.maskPayload(input);

    const emailCat = result.categories.find((c) => c.type === "email");
    const phoneCat = result.categories.find((c) => c.type === "phone");

    assert.ok(emailCat, "Should have email category");
    assert.equal(emailCat!.count, 2, "Should count 2 emails");
    assert.ok(phoneCat, "Should have phone category");
    assert.equal(phoneCat!.count, 1, "Should count 1 phone");
    log("✅ Category analytics passed");
  });
});

describe("ToolRegistry", () => {
  it("should register and retrieve a native tool", () => {
    const registry = new ToolRegistry();
    registry.registerNative(
      "mock-tool",
      "A mock tool for testing",
      z.object({ input: z.string() }),
      async (args) => ({ result: `processed: ${args.input}` }),
    );

    const tool = registry.getByName("mock-tool");
    assert.ok(tool, "Tool should be registered");
    assert.equal(tool!.category, "native");
    assert.equal(tool!.name, "mock-tool");
    log("✅ Native tool registration passed");
  });

  it("should register and retrieve MCP tools", () => {
    const registry = new ToolRegistry();
    registry.registerMcp("test-server", [
      { name: "list_items", description: "List items" },
      { name: "get_item", description: "Get an item by ID" },
    ]);

    const tool = registry.getByName("test-server::list_items");
    assert.ok(tool, "MCP tool should be registered");
    assert.equal(tool!.category, "mcp");
    assert.equal(tool!.mcpServerId, "test-server");
    log("✅ MCP tool registration passed");
  });

  it("should resolve ToolReference to UnifiedTool", () => {
    const registry = new ToolRegistry();
    registry.registerNative(
      "brave-search",
      "Web search",
      z.object({ query: z.string() }),
      async () => ({ results: [] }),
    );

    const ref = ToolReferenceSchema.parse({ name: "brave-search", category: "native" });
    const resolved = registry.get(ref);
    assert.ok(resolved, "Should resolve native ToolReference");
    assert.equal(resolved!.name, "brave-search");
    log("✅ ToolReference resolution passed");
  });

  it("should export OpenAI function-calling format", () => {
    const registry = new ToolRegistry();
    registry.registerNative(
      "search",
      "Search the web",
      z.object({ query: z.string().describe("Search query") }),
      async () => ({}),
    );

    const functions = registry.toOpenAIFunctions();
    assert.equal(functions.length, 1);
    const fn = functions[0] as Record<string, any>;
    assert.equal(fn.type, "function");
    assert.equal(fn.function.name, "search");
    log("✅ OpenAI function export passed");
  });
});

describe("Canvas Compiler", () => {
  it("should compile a valid CanvasDefinition into a LangGraph", () => {
    const canvas = createSampleCanvas();
    const registry = new ToolRegistry();
    registry.registerNative(
      "mock-tool",
      "Mock tool",
      z.object({ input: z.string().optional() }),
      async (args) => ({ status: "ok", input: args.input }),
    );

    const compiledGraph = compileCanvasToGraph(canvas, {
      registry,
      maskingGateway: new GovernanceMaskingGateway(undefined, LOGS_DIR),
      useCheckpointer: false,
    });

    assert.ok(compiledGraph, "Compiled graph should exist");
    log("✅ Canvas compilation passed — graph structure is valid");
  });

  it("should execute a mock invocation through the compiled graph", async () => {
    const canvas = createSampleCanvas();
    const registry = new ToolRegistry();
    registry.registerNative(
      "mock-tool",
      "Mock tool",
      z.object({ input: z.string().optional() }),
      async (args) => ({ status: "ok", input: args.input }),
    );

    const gateway = new GovernanceMaskingGateway(undefined, LOGS_DIR);

    const compiledGraph = compileCanvasToGraph(canvas, {
      registry,
      maskingGateway: gateway,
      useCheckpointer: false,
    });

    const result = await compiledGraph.invoke(
      { input: "Find vendors for john@savazar.com" },
      { configurable: { thread_id: "test-thread-1" } },
    );

    // Verify the graph executed and produced output
    assert.ok(result.output, "Graph should produce output");
    assert.ok(result.nodeOutputs, "Should have per-node outputs");
    log(`✅ Mock invocation passed — output: ${result.output.substring(0, 100)}`);
  });

  it("should apply governance masking during invocation", async () => {
    const canvas = createSampleCanvas();
    const registry = new ToolRegistry();
    registry.registerNative(
      "mock-tool",
      "Mock tool",
      z.object({ input: z.string().optional() }),
      async () => ({ status: "ok" }),
    );

    const gateway = new GovernanceMaskingGateway(undefined, LOGS_DIR);
    const compiledGraph = compileCanvasToGraph(canvas, {
      registry,
      maskingGateway: gateway,
      useCheckpointer: false,
    });

    const piiInput = "Send report to admin@savazar.com, phone 555-123-4567, SSN 123-45-6789.";
    const result = await compiledGraph.invoke(
      { input: piiInput },
      { configurable: { thread_id: "test-thread-masking" } },
    );

    // Verify masking was applied (intermediate state should have masked the PII)
    assert.ok(result.categories.length > 0, "Should detect PII categories");
    assert.ok(
      result.categories.some((c: { type: string }) => c.type === "email"),
      "Should detect email PII",
    );
    assert.ok(result.maskedInput, "Should have masked input");
    assert.ok(
      !result.maskedInput.includes("admin@savazar.com"),
      "Masked input should not contain raw email",
    );

    log(`✅ Governance masking verification passed — detected ${result.categories.length} PII categories`);
  });

  it("should trigger HITL gate on delete operations", async () => {
    const canvas = CanvasDefinitionSchema.parse({
      name: "HITL Test",
      nodes: [
        {
          id: "hitl-only",
          label: "Approval Gate",
          roleTemplate: "worker",
          systemPrompt: "",
          modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0 },
          tools: [],
          memoryCheckpoint: true,
          kvPersistence: false,
          hitlPolicy: "on_delete",
        },
      ],
      edges: [],
    });

    const compiledGraph = compileCanvasToGraph(canvas, {
      maskingGateway: new GovernanceMaskingGateway(undefined, LOGS_DIR),
      useCheckpointer: false,
    });

    const result = await compiledGraph.invoke(
      { input: "Please delete all guest records" },
      { configurable: { thread_id: "test-thread-hitl" } },
    );

    assert.equal(result.hitlStatus, "PENDING_APPROVAL", "Should freeze on delete action");
    log("✅ HITL gate triggered correctly on delete operation");
  });

  it("should allow non-delete operations through HITL gate", async () => {
    const canvas = CanvasDefinitionSchema.parse({
      name: "HITL Passthrough Test",
      nodes: [
        {
          id: "hitl-pass",
          label: "Approval Gate",
          roleTemplate: "worker",
          systemPrompt: "",
          modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0 },
          tools: [],
          memoryCheckpoint: true,
          kvPersistence: false,
          hitlPolicy: "on_delete",
        },
      ],
      edges: [],
    });

    const compiledGraph = compileCanvasToGraph(canvas, {
      maskingGateway: new GovernanceMaskingGateway(undefined, LOGS_DIR),
      useCheckpointer: false,
    });

    const result = await compiledGraph.invoke(
      { input: "Show me the guest list" },
      { configurable: { thread_id: "test-thread-hitl-pass" } },
    );

    assert.equal(result.hitlStatus, "approved", "Should auto-approve non-delete action");
    log("✅ HITL gate correctly auto-approved non-delete operation");
  });

  it("should support node handler overrides for testing", async () => {
    const canvas = CanvasDefinitionSchema.parse({
      name: "Override Test",
      nodes: [
        {
          id: "custom-node",
          label: "Custom",
          roleTemplate: "worker",
          systemPrompt: "Test",
          modelConfig: { provider: "openai", model: "gpt-4o", temperature: 0 },
          tools: [],
          memoryCheckpoint: true,
          kvPersistence: false,
        },
      ],
      edges: [],
    });

    const customHandler: NodeHandlerOverride = async (state) => ({
      output: `CUSTOM_OVERRIDE: ${state.input}`,
      nodeOutputs: { "custom-node": "overridden" },
    });

    const compiledGraph = compileCanvasToGraph(canvas, {
      maskingGateway: new GovernanceMaskingGateway(undefined, LOGS_DIR),
      nodeHandlerOverrides: { "custom-node": customHandler },
      useCheckpointer: false,
    });

    const result = await compiledGraph.invoke(
      { input: "test input" },
      { configurable: { thread_id: "test-thread-override" } },
    );

    assert.ok(result.output.includes("CUSTOM_OVERRIDE"), "Override handler should execute");
    log("✅ Node handler override passed");
  });
});

// ---------------------------------------------------------------------------
// Final summary
// ---------------------------------------------------------------------------

log("═══════════════════════════════════════════════════════");
log("All compiler.test.ts test suites registered.");
log("═══════════════════════════════════════════════════════");
