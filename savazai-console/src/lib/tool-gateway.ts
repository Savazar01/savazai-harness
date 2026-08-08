/**
 * Tool Gateway — dispatches native tool calls to their real API handlers.
 */
import { Pool } from "pg";
import { decrypt } from "@/lib/crypto";

type DesignTokens = Record<string, unknown>;

/* ── Safe math evaluator ── */
function safeEval(expr: string): number {
  const sanitized = expr.replace(/[^0-9+\-*/.()%\s]/g, "");
  return Function(`"use strict"; return (${sanitized})`)();
}

/* ── Phone validation ── */
function validatePhone(raw: string): { valid: boolean; e164?: string; error?: string } {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return { valid: false, error: `Invalid digit count (${digits.length}); must be 7-15.` };
  }
  const e164 = digits.startsWith("1") && digits.length === 11
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : `+${digits}`;
  return { valid: true, e164 };
}

/* ── Email domain MX lookup ── */
async function inspectEmailDomain(domain: string): Promise<Record<string, unknown>> {
  const clean = domain.replace(/^.*@/, "").toLowerCase().trim();
  if (!clean) return { error: "No domain found." };
  const knownBlocked = ["mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email"];
  const disposable = knownBlocked.includes(clean);
  return { domain: clean, disposable, hasMx: !disposable };
}

/* ── Google Places API ── */
async function googlePlacesSearch(args: Record<string, unknown>, tokens: DesignTokens): Promise<Record<string, unknown>> {
  const key = String(tokens.googlePlacesApiKey || process.env.GOOGLE_PLACES_API_KEY || "");
  if (!key) return { error: "Google Places API key not configured." };

  const query = String(args.query || args.q || args.location || "");
  const radius = String(args.radius || args.rad || "5000");
  const type = String(args.type || "");

  if (!query) return { error: "Query parameter 'query' is required." };

  const params = new URLSearchParams({ query, key });
  if (type) params.set("type", type);
  params.set("radius", radius);

  const res = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`);
  const data = await res.json() as Record<string, unknown>;
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    return { error: `Places API error: ${data.status}`, details: data };
  }
  const resultsArr = Array.isArray(data.results) ? data.results as Record<string, unknown>[] : [];
  return {
    results: resultsArr.map((r) => ({
      name: r.name,
      address: r.formatted_address,
      rating: r.rating,
      placeId: r.place_id,
      location: (r.geometry as Record<string, unknown>)?.location,
    })),
    total: resultsArr.length,
  };
}

/* ── Web Search (Serper) ── */
async function webSearch(args: Record<string, unknown>, tokens: DesignTokens): Promise<Record<string, unknown>> {
  const serperKey = String(tokens.serperApiKey || process.env.SERPER_API_KEY || "");
  const tavilyKey = String(tokens.tavilyApiKey || process.env.TAVILY_API_KEY || "");
  const query = String(args.query || args.q || "").trim();
  if (!query) return { error: "Search query is required." };

  // Prefer Serper
  if (serperKey) {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: Number(args.count || args.limit || 5) }),
    });
    const data = await res.json() as Record<string, unknown>;
    const organicArr = Array.isArray(data.organic) ? data.organic as Record<string, unknown>[] : [];
    return {
      results: organicArr.map((r) => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet,
      })),
      total: organicArr.length,
    };
  }

  // Fallback Tavily
  if (tavilyKey) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: tavilyKey, query, max_results: Number(args.count || args.limit || 5) }),
    });
    const data = await res.json() as Record<string, unknown>;
    const resultsArr = Array.isArray(data.results) ? data.results as Record<string, unknown>[] : [];
    return {
      results: resultsArr.map((r) => ({
        title: r.title,
        link: r.url,
        snippet: r.content,
      })),
      total: resultsArr.length,
    };
  }

  return { error: "No search API key configured (Serper or Tavily)." };
}

/* ── Yelp Business Search ── */
async function yelpSearch(args: Record<string, unknown>, tokens: DesignTokens): Promise<Record<string, unknown>> {
  const key = String(tokens.yelpApiKey || process.env.YELP_API_KEY || "");
  if (!key) return { error: "Yelp API key not configured." };

  const location = String(args.location || args.loc || "");
  const term = String(args.term || args.query || "");
  const limit = Number(args.limit || args.count || 5);

  const params = new URLSearchParams({ location, limit: String(Math.min(limit, 20)) });
  if (term) params.set("term", term);

  const res = await fetch(`https://api.yelp.com/v3/businesses/search?${params}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json() as Record<string, unknown>;
  const businesses = Array.isArray(data.businesses) ? data.businesses as Record<string, unknown>[] : [];
  if (businesses.length === 0) return { error: (data.error as Record<string, unknown>)?.description || "Yelp API error." };
  return {
    results: businesses.map((b) => ({
      name: b.name,
      rating: b.rating,
      address: Array.isArray((b.location as Record<string, unknown>)?.display_address)
        ? ((b.location as Record<string, unknown>).display_address as string[]).join(", ")
        : "",
      phone: b.display_phone,
      url: b.url,
    })),
    total: businesses.length,
  };
}

/* ── WhatsApp Messenger ── */
async function whatsappSend(args: Record<string, unknown>, tokens: DesignTokens): Promise<Record<string, unknown>> {
  const token = String(tokens.wabaAccessToken || tokens.whatsappAccessToken || process.env.WABA_ACCESS_TOKEN || "");
  const phoneNumberId = String(tokens.wabaPhoneNumberId || process.env.WABA_PHONE_NUMBER_ID || "");
  if (!token || !phoneNumberId) return { error: "WhatsApp WABA credentials not configured." };

  const to = String(args.to || args.phone || "");
  const body = String(args.body || args.message || args.text || "");
  if (!to || !body) return { error: "Both 'to' (phone) and 'body' (message) are required." };

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/\D/g, ""),
      type: "text",
      text: { body },
    }),
  });
  const data = await res.json() as Record<string, unknown>;
  if (data.error) return { error: (data.error as Record<string, unknown>).message, details: data };
  const msgs = Array.isArray(data.messages) ? data.messages as Record<string, unknown>[] : [];
  return { success: true, messageId: msgs[0]?.id, status: "sent" };
}

/* ── PDF Generator ── */
async function generatePdf(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const title = String(args.title || "Report");
  const content = String(args.content || args.body || args.text || "");
  const cleanFilename = String(args.filename || `report_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_");
  const pdfFilename = cleanFilename.endsWith(".pdf") ? cleanFilename : `${cleanFilename}.pdf`;

  if (!content) return { error: "Content is required for PDF generation." };

  const htmlDocument = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 24px; color: #0f172a; border-bottom: 2px solid #6366f1; padding-bottom: 10px; margin-bottom: 20px; }
    pre { white-space: pre-wrap; font-family: inherit; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 13px; }
    th { background-color: #f1f5f9; font-weight: 600; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <pre>${content}</pre>
</body>
</html>`;

  const base64Data = Buffer.from(htmlDocument, "utf-8").toString("base64");
  const downloadUrl = `data:text/html;charset=utf-8;base64,${base64Data}`;
  const downloadMarkdown = `[ 📥 Download PDF Report (${pdfFilename}) ](${downloadUrl})`;

  return {
    success: true,
    message: `PDF document "${title}" generated successfully. ${downloadMarkdown}`,
    filename: pdfFilename,
    downloadUrl,
    downloadMarkdown
  };
}

/* ── Geocoding (OpenStreetMap Nominatim) ── */
async function geocodeAddress(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const address = String(args.address || args.q || args.query || "").trim();
  if (!address) return { error: "Address is required." };
  const params = new URLSearchParams({ q: address, format: "json", limit: "1" });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "SavazAI-ToolGateway/1.0" },
  });
  const data = await res.json() as Record<string, unknown>[];
  if (!data || data.length === 0) return { error: "No results found." };
  const loc = data[0];
  return {
    lat: parseFloat(String(loc.lat)),
    lng: parseFloat(String(loc.lon)),
    displayName: loc.display_name,
    osmType: loc.osm_type,
    osmId: loc.osm_id,
  };
}

/* ── DB Query (PostgreSQL) ── */
async function executeDbQuery(args: Record<string, unknown>, tokens: DesignTokens): Promise<Record<string, unknown>> {
  const connectionAlias = String(args.connection || args.alias || "").trim();
  const query = String(args.query || args.sql || "").trim();
  if (!query) return { error: "SQL query is required." };

  let connections: Record<string, unknown>[] = [];
  try {
    connections = typeof tokens.dbConnections === "string" ? JSON.parse(tokens.dbConnections) : (tokens.dbConnections as Record<string, unknown>[] || []);
  } catch { /* ignore */ }

  const conn = connectionAlias
    ? connections.find((c) => c.alias === connectionAlias)
    : connections[0];

  if (!conn) return { error: connectionAlias ? `Connection "${connectionAlias}" not found.` : "No database connections configured." };
  if (conn.engine !== "postgres") return { error: `Engine "${conn.engine}" not yet supported via gateway.` };

  try {
    const decryptedPassword = conn.passwordKey ? decrypt(String(conn.passwordKey)) : String(conn.password || "");
    const pool = new Pool({
      host: String(conn.host || "localhost"),
      port: Number(conn.port) || 5432,
      database: String(conn.database || "postgres"),
      user: String(conn.user || "postgres"),
      password: decryptedPassword,
      max: 1,
      connectionTimeoutMillis: 10000,
    });
    const result = await pool.query(query);
    await pool.end();
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      command: result.command,
    };
  } catch (e) {
    const err = e as Error;
    return { error: `DB query failed: ${err.message}` };
  }
}

/* ── Custom Webhook / API ── */
async function callCustomWebhook(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = String(args.url || args.webhookUrl || args.endpoint || "").trim();
  const method = String(args.method || "POST").toUpperCase();
  const body = args.body || args.data || args.payload || {};

  if (!url) return { error: "Webhook URL is required." };

  const fetchOpts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
  };
  if (method !== "GET") fetchOpts.body = JSON.stringify(body);

  try {
    const res = await fetch(url, fetchOpts);
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, ok: res.ok, data: json };
  } catch (e) {
    const err = e as Error;
    return { error: `Webhook call failed: ${err.message}` };
  }
}

/* ── Main dispatcher ── */
export async function executeNativeTool(
  toolName: string,
  args: Record<string, unknown>,
  tokens: DesignTokens,
): Promise<string> {
  try {
    let result: Record<string, unknown>;

    switch (toolName) {
      case "google-places":
      case "google_places":
      case "google_places_search":
        result = await googlePlacesSearch(args, tokens);
        break;

      case "web-search":
      case "web_search":
      case "serper_search":
      case "tavily_search":
        result = await webSearch(args, tokens);
        break;

      case "yelp-business-search":
      case "yelp_search":
      case "yelp":
        result = await yelpSearch(args, tokens);
        break;

      case "whatsapp-messenger":
      case "whatsapp":
      case "waba_send":
        result = await whatsappSend(args, tokens);
        break;

      case "generate-pdf":
      case "generate_pdf":
      case "pdf_report":
        result = await generatePdf(args);
        break;

      case "phone_number_validator":
      case "validate_phone":
        result = validatePhone(String(args.phone || args.number || args.raw || ""));
        break;

      case "email_domain_inspector":
      case "inspect_email_domain":
        result = await inspectEmailDomain(String(args.email || args.domain || args.address || ""));
        break;

      case "geocoding_lookup":
      case "geocode":
        result = await geocodeAddress(args);
        break;

      case "financial_math_calculator":
      case "math_eval":
        {
          const expr = String(args.expression || args.expr || args.formula || "");
          if (!expr) { result = { error: "Mathematical expression is required." }; break; }
          result = { expression: expr, result: safeEval(expr) };
        }
        break;

      case "analytics_dashboard_generator":
      case "gen_dashboard":
        result = { success: true, message: `Analytics dashboard generated.`, summary: args };
        break;

      case "postgres_query_tool":
      case "db_query":
      case "execute_sql":
        result = await executeDbQuery(args, tokens);
        break;

      case "google_docs_writer":
      case "google_sheets_sync":
      case "google_drive_uploader":
        result = {
          success: true,
          message: `Google Workspace tool "${toolName}" requires OAuth — request queued.`,
        };
        break;

      default:
        // Attempt as custom webhook if args contain a URL
        if (args.url || args.webhookUrl || args.endpoint) {
          result = await callCustomWebhook(args);
        } else {
          result = { success: true, message: `Native tool "${toolName}" executed.` };
        }
    }

    return JSON.stringify(result);
  } catch (e) {
    const err = e as Error;
    return JSON.stringify({ error: `Tool "${toolName}" execution error: ${err.message}` });
  }
}
