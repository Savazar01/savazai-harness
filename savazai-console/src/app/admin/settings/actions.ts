"use server";
import { Pool } from "pg";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";
import type { LLMProviderConfig } from "@/components/theme-provider";
import { encrypt } from "@/lib/crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface UpdateSettingsInput {
  appTitle?: string;
  brandLogoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  background?: string;
  fontSans?: string;

  llmProviders?: Record<string, LLMProviderConfig>;
  activeModel?: string;

  mcpServers?: string;

  tavilyApiKey?: string;
  serperApiKey?: string;
  piiRegex?: string;

  googlePlacesApiKey?: string;
  googlePlacesRadius?: string;
  yelpClientId?: string;
  yelpApiKey?: string;
  gmailClientId?: string;
  gmailClientSecret?: string;
  gmailRedirectUri?: string;
  gmailRefreshToken?: string;
  sendgridApiKey?: string;
  sendgridSenderEmail?: string;
  wabaId?: string;
  wabaPhoneNumberId?: string;
  wabaAccessToken?: string;

  globalSystemPrompt?: string;
  orchestrationRules?: string;
  defaultAmbientParameters?: string;
  customSkills?: string;
  agentsMd?: string;
  capabilityProfile?: string;
}

export async function updateSystemConfig(input: UpdateSettingsInput) {
  try {
    const selectRes = await pool.query(
      'SELECT id, design_tokens as "designTokens" FROM system_configurations LIMIT 1'
    ).catch(() => null);

    let configId: string;
    let currentTokens: Record<string, unknown> = {};

    if (!selectRes || selectRes.rows.length === 0) {
      const insertRes = await pool.query(
        `INSERT INTO system_configurations (app_title, brand_logo_url, design_tokens)
         VALUES ($1, $2, $3)
         RETURNING id, design_tokens as "designTokens"`,
        [
          "SavazAI Console",
          "https://savazar.com/wp-content/uploads/2023/10/cropped-Transparent_Image_2-300x100.png",
          JSON.stringify({
            primaryColor: "#4f46e5",
            secondaryColor: "#06b6d4",
          }),
        ]
      );
      configId = insertRes.rows[0].id;
      currentTokens = insertRes.rows[0].designTokens || {};
    } else {
      configId = selectRes.rows[0].id;
      currentTokens = selectRes.rows[0].designTokens || {};
    }

    console.log("[updateSystemConfig] input.llmProviders:", JSON.stringify(input.llmProviders, null, 2));

    const mergedTokens: Record<string, unknown> = {
      ...currentTokens,
      ...(input.primaryColor !== undefined && { primaryColor: input.primaryColor }),
      ...(input.secondaryColor !== undefined && { secondaryColor: input.secondaryColor }),
      ...(input.background !== undefined && { background: input.background }),
      ...(input.fontSans !== undefined && { fontSans: input.fontSans }),

      ...(input.llmProviders !== undefined && { llmProviders: input.llmProviders }),
      ...(input.activeModel !== undefined && { activeModel: input.activeModel }),

      ...(input.mcpServers !== undefined && { mcpServers: input.mcpServers }),

      ...(input.tavilyApiKey !== undefined && { tavilyApiKey: input.tavilyApiKey }),
      ...(input.serperApiKey !== undefined && { serperApiKey: input.serperApiKey }),
      ...(input.piiRegex !== undefined && { piiRegex: input.piiRegex }),

      ...(input.googlePlacesApiKey !== undefined && { googlePlacesApiKey: input.googlePlacesApiKey }),
      ...(input.googlePlacesRadius !== undefined && { googlePlacesRadius: input.googlePlacesRadius }),
      ...(input.yelpClientId !== undefined && { yelpClientId: input.yelpClientId }),
      ...(input.yelpApiKey !== undefined && { yelpApiKey: input.yelpApiKey }),
      ...(input.gmailClientId !== undefined && { gmailClientId: encrypt(input.gmailClientId) }),
      ...(input.gmailClientSecret !== undefined && { gmailClientSecret: encrypt(input.gmailClientSecret) }),
      ...(input.gmailRefreshToken !== undefined && { 
        gmailRefreshToken: encrypt(input.gmailRefreshToken),
        OAUTH_REFRESH_TOKEN: encrypt(input.gmailRefreshToken) 
      }),
      ...(input.sendgridApiKey !== undefined && { sendgridApiKey: input.sendgridApiKey }),
      ...(input.sendgridSenderEmail !== undefined && { sendgridSenderEmail: input.sendgridSenderEmail }),
      ...(input.wabaId !== undefined && { wabaId: input.wabaId }),
      ...(input.wabaPhoneNumberId !== undefined && { wabaPhoneNumberId: input.wabaPhoneNumberId }),
      ...(input.wabaAccessToken !== undefined && { wabaAccessToken: input.wabaAccessToken }),

      ...(input.globalSystemPrompt !== undefined && { globalSystemPrompt: input.globalSystemPrompt }),
      ...(input.orchestrationRules !== undefined && { orchestrationRules: input.orchestrationRules }),
      ...(input.defaultAmbientParameters !== undefined && { defaultAmbientParameters: input.defaultAmbientParameters }),
      ...(input.customSkills !== undefined && { customSkills: input.customSkills }),
      ...(input.agentsMd !== undefined && { agentsMd: input.agentsMd }),
      ...(input.capabilityProfile !== undefined && { capabilityProfile: input.capabilityProfile }),
    };

    await pool.query(
      `UPDATE system_configurations 
       SET app_title = COALESCE($1, app_title), 
           brand_logo_url = COALESCE($2, brand_logo_url), 
           design_tokens = $3 
       WHERE id = $4`,
      [
        input.appTitle !== undefined && input.appTitle !== "" ? input.appTitle : null,
        input.brandLogoUrl !== undefined && input.brandLogoUrl !== "" ? input.brandLogoUrl : null,
        JSON.stringify(mergedTokens),
        configId,
      ]
    );

    revalidatePath("/");
    revalidatePath("/admin/settings");

    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    console.error("[settings-action] Failed to update configuration:", err);
    return { success: false, error: errorMsg };
  }
}

export async function testProviderConnection(
  providerType: string,
  endpoint: string,
  apiKey: string,
  model: string,
) {
  try {
    if (providerType === "ollama") {
      const res = await fetch(`${endpoint.replace(/\/$/, "")}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { success: false, error: `Ollama returned ${res.status}` };
      const data = await res.json();
      const models = (data.models ?? []).map((m: { name: string }) => m.name);
      return {
        success: true,
        detail: `Ollama reachable (${models.length} models available)`,
      };
    }

    if (providerType === "lmstudio") {
      const res = await fetch(`${endpoint.replace(/\/$/, "")}/v1/models`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { success: false, error: `LM Studio returned ${res.status}` };
      return { success: true, detail: "LM Studio server is reachable" };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      if (providerType === "anthropic") {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else if (providerType === "gemini") {
        headers["x-goog-api-key"] = apiKey;
      } else {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
    }

    const baseUrl = endpoint.replace(/\/$/, "");
    let testUrl = "";
    let testBody: string | undefined;

    if (providerType === "anthropic") {
      testUrl = `${baseUrl}/v1/messages`;
      testBody = JSON.stringify({
        model: model || "claude-3-5-sonnet",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
    } else if (providerType === "gemini") {
      testUrl = `${baseUrl}/v1/models/${model || "gemini-1.5-pro"}`;
      if (apiKey) {
        testUrl += `?key=${apiKey}`;
      }
    } else {
      testUrl = `${baseUrl}/models`;
    }

    const res = await fetch(testUrl, {
      method: testBody ? "POST" : "GET",
      headers,
      body: testBody,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { success: false, error: `${res.status}: ${text.slice(0, 100)}` };
    }

    return {
      success: true,
      detail: `Provider reachable (${res.status} OK)`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Connection test failed";
    return { success: false, error: msg };
  }
}

export async function fetchProviderModels(
  providerType: string,
  endpoint: string,
  apiKey: string,
) {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      if (providerType === "anthropic") {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else if (providerType === "gemini") {
        headers["x-goog-api-key"] = apiKey;
      } else {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
    }

    const baseUrl = endpoint.replace(/\/$/, "");
    let url = "";

    if (providerType === "ollama") {
      url = `${baseUrl}/api/tags`;
    } else if (providerType === "gemini") {
      url = `${baseUrl}/v1beta/models?key=${apiKey}`;
    } else if (providerType === "anthropic") {
      return { success: true, models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"] };
    } else {
      url = `${baseUrl}/models`;
    }

    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return { success: false, error: `Returned ${res.status}` };
    }

    const data = await res.json();
    let models: string[] = [];
    if (providerType === "ollama") {
      models = (data.models ?? []).map((m: { name: string }) => m.name);
    } else if (providerType === "gemini") {
      models = (data.models ?? []).map((m: { name: string }) => m.name.replace("models/", ""));
    } else {
      models = (data.data ?? []).map((m: { id: string }) => m.id);
    }

    return { success: true, models };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Fetch connection failed";
    return { success: false, error: msg };
  }
}

export async function readAgentsMd() {
  try {
    const selectRes = await pool.query(
      'SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1'
    ).catch(() => null);
    
    if (selectRes && selectRes.rows.length > 0 && selectRes.rows[0].designTokens?.agentsMd) {
      return { success: true, content: selectRes.rows[0].designTokens.agentsMd };
    }

    const filePath = path.join(process.cwd(), "..", "AGENTS.md");
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return { success: true, content };
    }
    return { success: true, content: "" };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function saveAgentsMd(content: string) {
  try {
    const selectRes = await pool.query(
      'SELECT id, design_tokens as "designTokens" FROM system_configurations LIMIT 1'
    ).catch(() => null);

    if (selectRes && selectRes.rows.length > 0) {
      const configId = selectRes.rows[0].id;
      const currentTokens = selectRes.rows[0].designTokens || {};
      const mergedTokens = { ...currentTokens, agentsMd: content };
      await pool.query(
        `UPDATE system_configurations SET design_tokens = $1 WHERE id = $2`,
        [JSON.stringify(mergedTokens), configId]
      );
    }

    const filePath = path.join(process.cwd(), "..", "AGENTS.md");
    fs.writeFileSync(filePath, content, "utf-8");
    
    revalidatePath("/admin/settings");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getTelemetryAnalytics() {
  try {
    const statsRes = await pool.query(`
      SELECT 
        COALESCE(SUM(input_tokens), 0)::int as "totalInputTokens",
        COALESCE(SUM(output_tokens), 0)::int as "totalOutputTokens",
        COALESCE(SUM(reasoning_tokens), 0)::int as "totalReasoningTokens",
        COALESCE(SUM(transaction_cost), 0.0)::double precision as "totalSpend",
        COUNT(*)::int as "totalRuns"
      FROM telemetry_logs
    `);

    const toolsRes = await pool.query(`
      SELECT executed_mcp_tools as "executedMcpTools" FROM telemetry_logs
    `);

    const logsRes = await pool.query(`
      SELECT 
        created_at as "createdAt",
        provider,
        model_name as "modelName",
        input_tokens as "inputTokens",
        output_tokens as "outputTokens",
        reasoning_tokens as "reasoningTokens",
        execution_latency_ms as "executionLatencyMs",
        transaction_cost as "spend"
      FROM telemetry_logs
      ORDER BY created_at DESC
      LIMIT 1000
    `);

    let totalToolCalls = 0;
    let successfulToolCalls = 0;
    const toolCounts: Record<string, { total: number; success: number; latencySum: number }> = {};

    for (const row of toolsRes.rows) {
      const tools = row.executedMcpTools;
      if (Array.isArray(tools)) {
        for (const call of tools) {
          if (!call || typeof call !== "object") continue;
          const name = call.toolName || "unknown";
          const status = call.statusCode || 200;
          const latency = call.latencyMs || 0;
          const isSuccess = status >= 200 && status < 300;

          totalToolCalls++;
          if (isSuccess) successfulToolCalls++;

          if (!toolCounts[name]) {
            toolCounts[name] = { total: 0, success: 0, latencySum: 0 };
          }
          toolCounts[name].total++;
          if (isSuccess) toolCounts[name].success++;
          toolCounts[name].latencySum += latency;
        }
      }
    }

    const successRate = totalToolCalls > 0 ? (successfulToolCalls / totalToolCalls) * 100 : 100;

    return {
      success: true,
      data: {
        totalInputTokens: statsRes.rows[0]?.totalInputTokens || 0,
        totalOutputTokens: statsRes.rows[0]?.totalOutputTokens || 0,
        totalReasoningTokens: statsRes.rows[0]?.totalReasoningTokens || 0,
        totalSpend: statsRes.rows[0]?.totalSpend || 0.0,
        totalRuns: statsRes.rows[0]?.totalRuns || 0,
        totalToolCalls,
        successfulToolCalls,
        successRate: Math.round(successRate * 10) / 10,
        toolBreakdown: Object.entries(toolCounts).map(([name, stats]) => ({
          name,
          total: stats.total,
          success: stats.success,
          rate: Math.round((stats.success / stats.total) * 1000) / 10,
          avgLatencyMs: Math.round(stats.latencySum / stats.total),
        })),
        logs: logsRes.rows.map((row) => ({
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
          provider: row.provider || "unknown",
          modelName: row.modelName || "unknown",
          inputTokens: Number(row.inputTokens || 0),
          outputTokens: Number(row.outputTokens || 0),
          reasoningTokens: Number(row.reasoningTokens || 0),
          executionLatencyMs: Number(row.executionLatencyMs || 0),
          spend: Number(row.spend || 0.0),
        })),
      }
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[getTelemetryAnalytics] Failed:", err);
    return { success: false, error: errorMsg };
  }
}

