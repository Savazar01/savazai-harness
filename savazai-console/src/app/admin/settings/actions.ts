"use server";

import { Pool } from "pg";
import { revalidatePath } from "next/cache";
import type { LLMProviderConfig } from "@/components/theme-provider";

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
  sendgridApiKey?: string;
  sendgridSenderEmail?: string;
  wabaId?: string;
  wabaPhoneNumberId?: string;
  wabaAccessToken?: string;
}

export async function updateSystemConfig(input: UpdateSettingsInput) {
  try {
    const selectRes = await pool.query(
      'SELECT id, design_tokens as "designTokens" FROM system_configurations LIMIT 1'
    ).catch(() => null);

    if (!selectRes || selectRes.rows.length === 0) {
      throw new Error("No system configuration found to update.");
    }

    const configId = selectRes.rows[0].id;
    const currentTokens: Record<string, unknown> = selectRes.rows[0].designTokens || {};

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
      ...(input.gmailClientId !== undefined && { gmailClientId: input.gmailClientId }),
      ...(input.gmailClientSecret !== undefined && { gmailClientSecret: input.gmailClientSecret }),
      ...(input.gmailRedirectUri !== undefined && { gmailRedirectUri: input.gmailRedirectUri }),
      ...(input.sendgridApiKey !== undefined && { sendgridApiKey: input.sendgridApiKey }),
      ...(input.sendgridSenderEmail !== undefined && { sendgridSenderEmail: input.sendgridSenderEmail }),
      ...(input.wabaId !== undefined && { wabaId: input.wabaId }),
      ...(input.wabaPhoneNumberId !== undefined && { wabaPhoneNumberId: input.wabaPhoneNumberId }),
      ...(input.wabaAccessToken !== undefined && { wabaAccessToken: input.wabaAccessToken }),
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
        // Gemini API key is in URL
      } else {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
    }

    const baseUrl = endpoint.replace(/\/$/, "");
    let url = "";

    if (providerType === "ollama") {
      url = `${baseUrl}/api/tags`;
    } else if (providerType === "gemini") {
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
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

