import { NextRequest } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface ComplianceEntityRule {
  entity: string;
  label: string;
  action: "mask" | "tokenize" | "block";
  enabled: boolean;
}

export interface KeywordRule {
  keyword: string;
  action: "mask" | "tokenize" | "block";
}

export interface ImportedFrameworkEntity {
  entity_key: string;
  label: string;
  default_action: "mask" | "tokenize" | "block";
  pattern?: string;
}

export interface ImportedFramework {
  framework_id: string;
  name: string;
  regulatory_reference: string;
  description: string;
  entities: ImportedFrameworkEntity[];
  active?: boolean;
}

export interface ComplianceConfig {
  frameworks: string[];
  entityRules: ComplianceEntityRule[];
  customKeywords: KeywordRule[];
  customRegex: { pattern: string; label: string }[];
  importedFrameworks?: ImportedFramework[];
}

const DEFAULT_ENTITY_RULES: ComplianceEntityRule[] = [
  { entity: "person_name", label: "Person Name", action: "mask", enabled: true },
  { entity: "email", label: "Email", action: "mask", enabled: true },
  { entity: "phone", label: "Phone Number", action: "mask", enabled: true },
  { entity: "ssn", label: "SSN / National ID", action: "mask", enabled: true },
  { entity: "credit_card", label: "Credit Card / CVV", action: "block", enabled: true },
  { entity: "iban", label: "IBAN / Bank Account", action: "mask", enabled: true },
  { entity: "ip_address", label: "IP Address", action: "mask", enabled: true },
  { entity: "location", label: "Location", action: "mask", enabled: true },
];

export async function GET() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS agentflow_compliance_rules (
      id UUID PRIMARY KEY,
      config JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    const res = await pool.query(
      'SELECT config FROM agentflow_compliance_rules ORDER BY updated_at DESC LIMIT 1'
    );

    if (res.rows.length === 0) {
      return new Response(JSON.stringify({
        frameworks: [],
        entityRules: DEFAULT_ENTITY_RULES,
        customKeywords: [],
        customRegex: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const config = migrateConfig(res.rows[0].config as ComplianceConfig);
    return new Response(JSON.stringify(config), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api-compliance] GET failed:", err);
    return new Response(
      JSON.stringify({ error: errMsg || "Failed to load compliance rules." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

function migrateConfig(config: ComplianceConfig): ComplianceConfig {
    const migrated = { ...config };
  // Migrate legacy string[] keywords to KeywordRule[]
  if (Array.isArray(migrated.customKeywords)) {
    if (migrated.customKeywords.length > 0 && typeof migrated.customKeywords[0] === "string") {
      migrated.customKeywords = (migrated.customKeywords as unknown as string[]).map(k => ({ keyword: k, action: "mask" as const }));
    }
  }
  return migrated;
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as ComplianceConfig;
    const id = crypto.randomUUID();

    await pool.query(`CREATE TABLE IF NOT EXISTS agentflow_compliance_rules (
      id UUID PRIMARY KEY,
      config JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Delete old config, insert new
    await pool.query('DELETE FROM agentflow_compliance_rules');
    await pool.query(
      'INSERT INTO agentflow_compliance_rules (id, config) VALUES ($1, $2)',
      [id, JSON.stringify(body)]
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api-compliance] PUT failed:", err);
    return new Response(
      JSON.stringify({ error: errMsg || "Failed to save compliance rules." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// AI-powered regex generation from sample input
export async function POST(req: NextRequest) {
  try {
    const { sample, label } = await req.json();
    if (!sample || typeof sample !== "string") {
      return new Response(
        JSON.stringify({ error: "Sample input string is required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch LLM provider config from system_configurations to generate regex
    const configRes = await pool.query(
      'SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1'
    );
    let apiKey = "";
    let model = "gpt-4o-mini";
    let baseUrl = "https://api.openai.com/v1/chat/completions";

    if (configRes.rows.length > 0) {
      const tokens = configRes.rows[0].designTokens as Record<string, unknown>;
      const providers = tokens.llmProviders as Record<string, { apiKey?: string; baseUrl?: string; models?: string[] }> | undefined;
      if (providers) {
        const openai = providers["openai"];
        if (openai?.apiKey) {
          apiKey = openai.apiKey;
          if (openai.baseUrl) baseUrl = openai.baseUrl + "/chat/completions";
          if (openai.models && openai.models.length > 0) model = openai.models[0];
        }
        // Fall back to openai-compatible
        if (!apiKey) {
          const compat = providers["openai-compatible"];
          if (compat?.apiKey) {
            apiKey = compat.apiKey;
            if (compat.baseUrl) baseUrl = compat.baseUrl + "/chat/completions";
            if (compat.models && compat.models.length > 0) model = compat.models[0];
          }
        }
      }
    }

    if (!apiKey) {
      // Offline fallback: generate a simple regex for common patterns
      const escaped = sample.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const generated = `\\b${escaped.replace(/\d+/g, "\\\\d+").replace(/[A-Z]+/g, "[A-Z]+")}\\b`;
      return new Response(
        JSON.stringify({ pattern: generated, label: label || `Regex for ${sample.slice(0, 20)}`, source: "fallback" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const prompt = `You are a regex pattern generator. Given a sample input string, generate a JavaScript-compatible regular expression pattern that would match this format.

Sample input: "${sample}"

Return ONLY a JSON object with no markdown:
{
  "pattern": "the regex pattern as a string (escaped for JS usage)",
  "explanation": "brief explanation of what the pattern matches"
}

CRITICAL RULES:
- The regex MUST be compatible with JavaScript's RegExp constructor (no PCRE-only features)
- Escape all backslashes properly for JSON (e.g., \\\\d for \\\\d)
- Do NOT include delimiters (/pattern/flags) — return only the pattern string
- Make the pattern specific enough to match the format but general enough to catch variations`;

    const llmRes = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a regex pattern generator. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!llmRes.ok) throw new Error(`LLM API status ${llmRes.status}`);

    const llmData = await llmRes.json();
    const content = llmData.choices?.[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
    const result = JSON.parse(cleaned);

    return new Response(
      JSON.stringify({
        pattern: result.pattern || `\\b${sample.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        label: label || `Regex for ${sample.slice(0, 20)}`,
        explanation: result.explanation || "",
        source: "ai",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: errMsg || "Failed to generate regex pattern." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
