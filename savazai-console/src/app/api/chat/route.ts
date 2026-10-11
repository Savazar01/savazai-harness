import { NextRequest } from "next/server";
import { Pool } from "pg";
import { POST as orchestratorTestPOST } from "@/app/api/orchestrator/test/route";
import {
  queryLLMWithHistory,
  parseToolCalls,
  type ChatMessage,
  type AgentflowTool,
  type LLMProviderConfig,
  type McpToolInputSchema,
} from "@/app/api/orchestrator/test/route";
import { McpAggregator } from "@/lib/mcp/client-aggregator";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const BACKEND_URL =
  process.env.NEXT_PUBLIC_HARNESS_API_URL || "http://savazai-backend:3055";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    message,
    currentApp,
    provider,
    model,
    files,
    activeTools,
    threadId,
    workflowId,
    executionMode,
    resume,
    mode,
    selectedMcpServers,
  } = body;

  // ── MODE 1: PUBLISHED AGENTFLOWS ──
  // If workflowId is a valid UUID, execute strictly through the unified orchestrator engine
  if (workflowId && typeof workflowId === "string" && /^[0-9a-fA-F-]{36}$/.test(workflowId.trim())) {
    const testPayload: Record<string, unknown> = {
      workflowId: workflowId.trim(),
      message,
      threadId,
      executionMode,
    };

    if (resume !== undefined) {
      if (typeof resume === "object" && resume !== null) {
        const resObj = resume as Record<string, unknown>;
        if (resObj.approved) {
          testPayload.approvedPlan = (Array.isArray(resObj.plan) && resObj.plan.length > 0) ? resObj.plan : true;
        } else {
          testPayload.approvedPlan = false;
          if (resObj.feedback) testPayload.message = String(resObj.feedback);
        }
      } else {
        testPayload.approvedPlan = resume;
      }
    }

    const testReq = new NextRequest(new URL("/api/orchestrator/test", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testPayload),
    });

    return orchestratorTestPOST(testReq);
  }

  // ── MODE 2: DIRECT MCP CHAT ──
  // When mode is "direct-mcp" or there is no workflowId, run direct tool calling WITHOUT supervisor or plan interrupts
  const isDirectMcp = mode === "direct-mcp" || (!workflowId && Array.isArray(activeTools));

  if (isDirectMcp) {
    const encoder = new TextEncoder();
    const effectiveServers = Array.isArray(selectedMcpServers) && selectedMcpServers.length > 0
      ? selectedMcpServers
      : Array.isArray(activeTools) ? activeTools : [];

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          if (!message || typeof message !== "string" || !message.trim()) {
            sendEvent({ type: "content", content: "Please provide a query or instruction." });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          if (effectiveServers.length === 0) {
            sendEvent({
              type: "content",
              content: "⚠️ **No MCP Server Selected**\n\nPlease select an active MCP server from the dropdown above to execute queries and retrieve data.",
            });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          // 1. Resolve Provider Credentials from system_configurations
          let providerConfigs: Record<string, LLMProviderConfig> = {};
          try {
            const configRes = await pool.query(
              'SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1'
            );
            if (configRes.rows.length > 0 && configRes.rows[0].designTokens) {
              const dt = configRes.rows[0].designTokens;
              providerConfigs = dt.llmProviders || {};
            }
          } catch (dbErr) {
            console.warn("[Direct MCP Chat] Failed to read llmProviders:", dbErr);
          }

          // Determine active provider & model
          let targetProvider = provider || "openai";
          let targetModel = model || "gpt-4o-mini";
          if (!providerConfigs[targetProvider]?.apiKey) {
            for (const [pName, pCfg] of Object.entries(providerConfigs)) {
              if (pCfg?.apiKey) {
                targetProvider = pName;
                targetModel = pCfg.defaultModel || (pCfg.models && pCfg.models[0]) || targetModel;
                break;
              }
            }
          }

          sendEvent({
            type: "trace",
            content: `[Direct MCP] Provider: ${targetProvider} (${targetModel}) | Servers: [${effectiveServers.join(", ")}]`,
          });

          // 2. Discover Tools for the selected servers ONLY
          const aggregator = McpAggregator.getInstance();
          const { allTools } = await aggregator.listAllTools(pool);

          const boundTools: AgentflowTool[] = allTools
            .filter((t) => t.serverId && effectiveServers.includes(t.serverId))
            .map((t) => ({
              name: t.name,
              description: t.description || `Execute operation on ${t.serverId}`,
              serverId: t.serverId,
              inputSchema: t.inputSchema as McpToolInputSchema,
            }));

          sendEvent({
            type: "trace",
            content: `[Direct MCP] Bound ${boundTools.length} tool(s) from [${effectiveServers.join(", ")}]`,
          });

          // 3. System Prompt: Direct Tool Assistant (Zero domain leaks)
          const systemPrompt = `You are an expert AI assistant with access to real-time tools from connected MCP servers: ${effectiveServers.join(", ")}.
Always use the provided function tools to retrieve live data or execute requested operations.
When asked for stock data, historical prices, market quantities, or server resources, ALWAYS call the appropriate tool.
Once you receive the tool output, present the results clearly in clean, structured Markdown tables or lists with formatting.
Do NOT make up data; rely strictly on tool execution results.`;

          const conversation: ChatMessage[] = [
            { role: "user", content: message },
          ];

          // 4. Initial LLM Call with function tools
          sendEvent({
            type: "trace",
            content: `[Direct MCP] Evaluating query with model ${targetModel}...`,
          });

          const initialResponse = await queryLLMWithHistory(
            targetProvider,
            targetModel,
            systemPrompt,
            conversation,
            providerConfigs,
            boundTools.length > 0 ? boundTools : undefined,
            "auto"
          );

          const parsedCalls = parseToolCalls(initialResponse);

          if (parsedCalls.length > 0) {
            // Execute Tool Calls
            for (const call of parsedCalls) {
              const matchedTool = boundTools.find((t) => t.name === call.name);
              const targetServer = matchedTool?.serverId || effectiveServers[0];

              sendEvent({
                type: "tool",
                node: `Tool: ${call.name}`,
                content: `Invoking ${call.name} on server "${targetServer}" with parameters: ${JSON.stringify(call.arguments)}`,
              });

              let toolResultPayload = "";
              try {
                const execRes = await aggregator.executeTool(targetServer, call.name, call.arguments, pool);
                if (execRes.isError) {
                  toolResultPayload = JSON.stringify({ error: execRes.content[0]?.text || "Tool failed", isError: true });
                } else if (execRes.content && execRes.content.length > 0) {
                  const textItem = execRes.content.find((c) => c.type === "text");
                  toolResultPayload = textItem ? textItem.text : JSON.stringify(execRes.content);
                } else {
                  toolResultPayload = JSON.stringify(execRes);
                }
              } catch (execErr: unknown) {
                const msg = execErr instanceof Error ? execErr.message : String(execErr);
                toolResultPayload = JSON.stringify({ error: msg, isError: true });
              }

              sendEvent({
                type: "trace",
                content: `[Direct MCP] Tool ${call.name} returned ${toolResultPayload.length} chars of output`,
              });

              // Append tool output to conversation
              conversation.push({
                role: "tool",
                name: call.name,
                content: toolResultPayload,
              });
            }

            // Synthesize Final Response with Tool Context
            sendEvent({
              type: "trace",
              content: `[Direct MCP] Synthesizing final answer from tool output...`,
            });

            const finalResponse = await queryLLMWithHistory(
              targetProvider,
              targetModel,
              systemPrompt,
              conversation,
              providerConfigs
            );

            // Stream markdown in manageable chunks for smooth rendering
            const chunkSize = 64;
            for (let i = 0; i < finalResponse.length; i += chunkSize) {
              sendEvent({
                type: "content",
                content: finalResponse.slice(i, i + chunkSize),
              });
            }
          } else {
            // No tool call needed, stream the direct assistant text response
            const cleanContent = initialResponse.replace(/```json\s*\{[\s\S]*?\}\s*```/g, "").trim();
            const textToStream = cleanContent || initialResponse;
            const chunkSize = 64;
            for (let i = 0; i < textToStream.length; i += chunkSize) {
              sendEvent({
                type: "content",
                content: textToStream.slice(i, i + chunkSize),
              });
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (streamErr: unknown) {
          const errMessage = streamErr instanceof Error ? streamErr.message : String(streamErr);
          sendEvent({
            type: "content",
            content: `\n\n❌ **Direct MCP Chat Error**: ${errMessage}`,
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── FALLBACK PROXY FOR UNMANAGED FLOWS ──
  const backendUrl = `${BACKEND_URL}/api/graph/invoke/stream?stream-mode=http`;

  const modelConfig = provider
    ? { providerType: provider, modelName: model ?? "" }
    : model
      ? { providerType: model }
      : undefined;

  const payload: Record<string, unknown> = {
    currentApp: currentApp ?? "WedPlanAI-Local",
    threadId,
  };
  if (message !== undefined) payload.message = message;
  if (modelConfig) payload.modelConfig = modelConfig;
  if (files && Array.isArray(files) && files.length > 0) payload.files = files;
  if (activeTools && Array.isArray(activeTools) && activeTools.length > 0) {
    payload.activeTools = activeTools;
  }
  if (workflowId) payload.workflowId = workflowId;
  if (executionMode) payload.executionMode = executionMode;
  if (resume !== undefined) payload.resume = resume;

  const response = await fetch(backendUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => `Backend error: ${response.status}`);
    return new Response(
      JSON.stringify({ error: errorText }),
      { status: response.status, headers: { "Content-Type": "application/json" } },
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return new Response(
      JSON.stringify({ error: "Backend returned no body" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const threadId = pathParts[pathParts.length - 1];

  const backendUrl = `${BACKEND_URL}/api/graph/threads/${threadId}`;
  const response = await fetch(backendUrl, {
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => `Backend error: ${response.status}`);
    return new Response(JSON.stringify({ error: errText }), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
