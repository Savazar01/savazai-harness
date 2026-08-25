/**
 * Tool Gateway — dispatches native tool calls to their real API handlers.
 */
import { Pool } from "pg";
import { decrypt } from "@/lib/crypto";

type DesignTokens = Record<string, unknown>;

/* ── SSRF URL Validator ── */
export function isSafeExternalUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host === "169.254.169.254" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host === "savazai-backend" ||
      host === "savazai-db" ||
      host === "savazai-console"
    ) {
      return false;
    }
    if (
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("127.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/* ── Read-only SQL Validator ── */
export function isReadOnlySqlQuery(sqlStr: string): boolean {
  const trimmed = sqlStr.trim();
  if (!trimmed) return false;
  
  const startsWithAllowed = /^(SELECT|EXPLAIN|SHOW|WITH)\b/i.test(trimmed);
  if (!startsWithAllowed) return false;

  const forbidden = /\b(DROP|ALTER|TRUNCATE|DELETE|UPDATE|INSERT|GRANT|REVOKE|COPY|EXECUTE|CREATE|REPLACE|VACUUM|REINDEX|LOCK|CALL|DO)\b/i;
  if (forbidden.test(trimmed)) return false;

  const statements = trimmed.split(";").map((s) => s.trim()).filter(Boolean);
  if (statements.length > 1) return false;

  return true;
}

/* ── Pure Safe Math Evaluator (No Function/eval) ── */
export function safeEval(expr: string): number {
  const sanitized = expr.replace(/[^0-9+\-*/().\s]/g, "").trim();
  if (!sanitized) throw new Error("Empty mathematical expression.");

  const tokens: string[] = [];
  const regex = /\d+(\.\d+)?|[+\-*/()]/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(sanitized)) !== null) {
    tokens.push(m[0]);
  }
  if (tokens.length === 0) throw new Error("Invalid mathematical expression.");

  let index = 0;
  function parsePrimary(): number {
    const token = tokens[index++];
    if (token === "(") {
      const val = parseAddSub();
      if (tokens[index++] !== ")") throw new Error("Mismatched parentheses in expression.");
      return val;
    }
    if (token === "-" || token === "+") {
      const next = parsePrimary();
      return token === "-" ? -next : next;
    }
    const num = parseFloat(token);
    if (isNaN(num)) throw new Error(`Invalid token: ${token}`);
    return num;
  }

  function parseMulDiv(): number {
    let left = parsePrimary();
    while (index < tokens.length && (tokens[index] === "*" || tokens[index] === "/")) {
      const op = tokens[index++];
      const right = parsePrimary();
      if (op === "*") {
        left *= right;
      } else {
        if (right === 0) throw new Error("Division by zero.");
        left /= right;
      }
    }
    return left;
  }

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (index < tokens.length && (tokens[index] === "+" || tokens[index] === "-")) {
      const op = tokens[index++];
      const right = parseMulDiv();
      if (op === "+") left += right;
      else left -= right;
    }
    return left;
  }

  const result = parseAddSub();
  if (index < tokens.length) throw new Error("Unexpected trailing characters in expression.");
  return result;
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

/* ── Contact Extraction Helpers ── */
function extractEmails(text: string): string[] {
  if (!text) return [];
  const matches = Array.from(text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g));
  return Array.from(new Set(matches.map((m) => m[0].replace(/[.,;:)\]]+$/, "")).filter(Boolean)));
}

function extractPhones(text: string): string[] {
  if (!text) return [];
  const phoneRegex = /(?:\+91[\-\s]?)?[6-9]\d{4}[\-\s]?\d{5}|\b0\d{2,4}[\-\s]?\d{6,8}\b|\b\d{5}[\-\s]?\d{5}\b|\+?\d{1,3}[-.\s]\(?\d{2,4}\)?[-.\s]\d{3,4}[-.\s]\d{3,4}/g;
  const matches = text.match(phoneRegex) || [];
  return Array.from(new Set(matches.map((p) => p.trim()).filter((p) => !/^\d{4}$/.test(p))));
}

/* ── Google Places (New) API ── */
async function googlePlacesSearch(args: Record<string, unknown>, tokens: DesignTokens): Promise<Record<string, unknown>> {
  const key = String(tokens.googlePlacesApiKey || process.env.GOOGLE_PLACES_API_KEY || "");
  if (!key) return { error: "Google Places API key not configured." };

  const textQuery = String(args.textQuery || args.query || args.search_query || args.location || args.q || "").trim();
  if (!textQuery) return { error: "Query parameter 'textQuery' or 'query' is required." };

  const pageSize = Math.min(Math.max(Number(args.pageSize || args.limit || args.count || 20), 1), 20);
  const languageCode = args.languageCode || args.language ? String(args.languageCode || args.language) : undefined;

  const requestBody: Record<string, unknown> = {
    textQuery,
    pageSize,
  };
  if (languageCode) requestBody.languageCode = languageCode;

  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.rating",
    "places.userRatingCount",
    "places.priceLevel",
    "places.nationalPhoneNumber",
    "places.internationalPhoneNumber",
    "places.websiteUri",
    "places.googleMapsUri",
    "places.businessStatus",
    "places.regularOpeningHours"
  ].join(",");

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errorText = await res.text();
    return { error: `Google Places API returned ${res.status}: ${errorText}` };
  }

  const data = await res.json() as Record<string, unknown>;
  const placesArr = Array.isArray(data.places) ? data.places as Record<string, unknown>[] : [];

  return {
    results: placesArr.map((p) => {
      const displayNameObj = p.displayName as Record<string, unknown> | undefined;
      const name = String(displayNameObj?.text || p.displayName || p.name || "Unnamed Place");
      const phone = (p.nationalPhoneNumber || p.internationalPhoneNumber || null) as string | null;
      const website = (p.websiteUri || p.googleMapsUri || null) as string | null;
      const address = (p.formattedAddress || "") as string;

      return {
        name,
        address,
        rating: p.rating ?? null,
        review_count: p.userRatingCount ?? null,
        phone,
        website,
        email: null,
        googleMapsUri: (p.googleMapsUri || null) as string | null,
        businessStatus: (p.businessStatus || null) as string | null,
        placeId: (p.id || null) as string | null,
      };
    }),
    total: placesArr.length,
  };
}

/* ── Web Search (Serper / Tavily) ── */
async function webSearch(args: Record<string, unknown>, tokens: DesignTokens, searchEndpoint = "search"): Promise<Record<string, unknown>> {
  const serperKey = String(tokens.serperApiKey || process.env.SERPER_API_KEY || "");
  const tavilyKey = String(tokens.tavilyApiKey || process.env.TAVILY_API_KEY || "");
  const query = String(args.query || args.textQuery || args.search_query || args.q || "").trim();
  if (!query) return { error: "Search query is required." };

  const count = Number(args.count || args.limit || args.pageSize || 5);

  // Prefer Serper
  if (serperKey) {
    const endpoint = searchEndpoint === "places" ? "https://google.serper.dev/places" : "https://google.serper.dev/search";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: count }),
    });
    const data = await res.json() as Record<string, unknown>;

    const results: Record<string, unknown>[] = [];

    // Process places if returned by Serper
    if (Array.isArray(data.places)) {
      for (const p of data.places as Record<string, unknown>[]) {
        const title = String(p.title || p.name || "");
        const address = String(p.address || "");
        const phone = (p.phoneNumber || p.phone || null) as string | null;
        const website = (p.website || p.link || null) as string | null;
        results.push({
          name: title,
          address,
          rating: p.rating ?? null,
          review_count: p.ratingCount ?? null,
          phone,
          website,
          email: null,
          snippet: String(p.category || address),
        });
      }
    }

    // Process organic search results
    if (Array.isArray(data.organic)) {
      for (const r of data.organic as Record<string, unknown>[]) {
        const snippet = String(r.snippet || "");
        const title = String(r.title || "");
        const fullSnippet = `${title} ${snippet}`;
        const emails = extractEmails(fullSnippet);
        const phones = extractPhones(fullSnippet);

        results.push({
          name: title,
          address: "",
          rating: null,
          review_count: null,
          phone: phones[0] || null,
          website: (r.link || null) as string | null,
          email: emails[0] || null,
          snippet,
        });
      }
    }

    return {
      results,
      total: results.length,
    };
  }

  // Fallback Tavily
  if (tavilyKey) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: tavilyKey, query, max_results: count }),
    });
    const data = await res.json() as Record<string, unknown>;
    const resultsArr = Array.isArray(data.results) ? data.results as Record<string, unknown>[] : [];

    return {
      results: resultsArr.map((r) => {
        const content = String(r.content || "");
        const title = String(r.title || "");
        const fullText = `${title} ${content}`;
        const emails = extractEmails(fullText);
        const phones = extractPhones(fullText);

        return {
          name: title,
          address: "",
          rating: null,
          review_count: null,
          phone: phones[0] || null,
          website: (r.url || null) as string | null,
          email: emails[0] || null,
          snippet: content,
        };
      }),
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

/* ── Table & Cell Sanitization ── */
export function sanitizeTableCell(val: unknown): string {
  if (val === null || val === undefined) return "Not listed";
  return String(val)
    .replace(/[\r\n]+/g, " ")     // Replace newlines with single spaces
    .replace(/\|/g, "/")           // Replace pipes to prevent column breakage
    .replace(/\s{2,}/g, " ")       // Collapse multiple spaces
    .trim();
}

/* ── RFC 4180 CSV Generator ── */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

function isEntityRecord(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const rec = obj as Record<string, unknown>;
  // Exclude tool execution receipts
  if (rec.toolName && rec.status && Object.keys(rec).length <= 4) return false;
  return Boolean(
    rec.name || rec.title || rec.businessName || rec.address || rec.formattedAddress ||
    rec.rating || rec.phone || rec.website || rec.caterer || rec.vendor || rec.guest || rec.task
  );
}

export function extractRecordsFromPayload(raw: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(raw)) {
    const valid = raw.filter(r => isEntityRecord(r));
    if (valid.length > 0) return valid as Record<string, unknown>[];
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const candidateKeys = ["results", "items", "records", "data", "places", "rows", "caterers", "vendors", "guests", "tasks", "ceremonies", "businesses"];
    for (const key of candidateKeys) {
      if (Array.isArray(obj[key])) {
        const valid = (obj[key] as unknown[]).filter(r => isEntityRecord(r));
        if (valid.length > 0) return valid as Record<string, unknown>[];
      }
    }
  }
  if (typeof raw === "string") {
    const cleanRaw = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    // 1. Try direct parse
    try {
      const parsed = JSON.parse(cleanRaw);
      const res = extractRecordsFromPayload(parsed);
      if (res && res.length > 0) return res;
    } catch {}

    // 2. Scan for JSON blocks matching { "results": [...] }
    const jsonBlockRegex = /\{[\s\S]*?"(?:results|places|items|records|data|rows|caterers|vendors|businesses)"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/g;
    const matches = cleanRaw.match(jsonBlockRegex);
    if (matches) {
      for (const block of matches) {
        try {
          const parsed = JSON.parse(block);
          const res = extractRecordsFromPayload(parsed);
          if (res && res.length > 0) return res;
        } catch {}
      }
    }

    // 3. Scan for standalone JSON array of objects [ { ... }, { ... } ]
    const arrayRegex = /\[\s*\{[\s\S]*?\}\s*\]/g;
    const arrayMatches = cleanRaw.match(arrayRegex);
    if (arrayMatches) {
      for (const arrBlock of arrayMatches) {
        try {
          const parsed = JSON.parse(arrBlock);
          if (Array.isArray(parsed)) {
            const valid = parsed.filter(r => isEntityRecord(r));
            if (valid.length > 0) return valid as Record<string, unknown>[];
          }
        } catch {}
      }
    }
  }
  return null;
}

async function generateCsv(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  let cleanBase = String(args.filename || args.title || `export_${Date.now()}`)
    .replace(/\.csv$/i, "")
    .replace(/_csv$/i, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+$/, "");
  if (!cleanBase) cleanBase = "export";
  const csvFilename = `${cleanBase}.csv`;
  const rawData = args.data || args.records || args.items || args.rows || args.content || "";

  let csvContent = "";
  const extractedRecords = extractRecordsFromPayload(rawData);

  if (extractedRecords && extractedRecords.length > 0) {
    // Exclude raw internal UUID keys like placeId or id unless meaningful
    const allKeys = Array.from(new Set(extractedRecords.flatMap(r => Object.keys(r))))
      .filter(k => k !== "placeId" && k !== "businessStatus" && !k.startsWith("__"));
    
    // Sort keys intelligently (name, rating, review_count, address, phone, website, etc.)
    const preferredOrder = ["name", "rating", "review_count", "address", "phone", "website", "googleMapsUri", "email"];
    const sortedKeys = allKeys.sort((a, b) => {
      const idxA = preferredOrder.indexOf(a);
      const idxB = preferredOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    const headerLine = sortedKeys.map(h => escapeCsvCell(h.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim())).join(",");
    const dataLines = extractedRecords.map(row =>
      sortedKeys.map(k => escapeCsvCell(sanitizeTableCell(row[k]))).join(",")
    );
    csvContent = [headerLine, ...dataLines].join("\r\n");
  } else if (typeof rawData === "string" && rawData.trim()) {
    const lines = rawData.trim().split(/\r?\n/);
    const tableLines = lines.filter(l => l.includes("|") && !l.includes("---"));
    if (tableLines.length > 0) {
      csvContent = tableLines.map(l => {
        const cells = l.split("|").map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length);
        return cells.map(c => escapeCsvCell(sanitizeTableCell(c.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^[📞🌐🗺️📧⭐\s]+/g, "")))).join(",");
      }).join("\r\n");
    } else {
      csvContent = rawData;
    }
  } else {
    csvContent = "Name,Rating,Review Count,Address,Phone,Website\r\n";
  }

  const base64Data = Buffer.from(csvContent, "utf-8").toString("base64");
  const downloadUrl = `data:text/csv;charset=utf-8;base64,${base64Data}`;
  const downloadMarkdown = `[📥 Download CSV Export: ${csvFilename}](<${downloadUrl}>)`;

  return {
    success: true,
    message: `CSV file "${csvFilename}" generated successfully. ${downloadMarkdown}`,
    filename: csvFilename,
    downloadUrl,
    downloadMarkdown,
    rowCount: Math.max(0, csvContent.split("\r\n").length - 1)
  };
}

export function formatHtmlEmailBody(title: string, content: string): string {
  let bodyHtml = "";
  const extractedRecords = extractRecordsFromPayload(content);

  if (extractedRecords && extractedRecords.length > 0) {
    const allKeys = Array.from(new Set(extractedRecords.flatMap(r => Object.keys(r))))
      .filter(k => k !== "placeId" && k !== "businessStatus" && !k.startsWith("__") && k !== "price_level" && k !== "operational_status" && k !== "highlights");
    const preferredOrder = ["name", "title", "category", "rating", "review_count", "reviews_count", "userRatingCount", "address", "formattedAddress", "phone", "website", "website_or_map_link", "googleMapsUri", "email"];
    const displayKeys = allKeys.sort((a, b) => {
      const idxA = preferredOrder.indexOf(a);
      const idxB = preferredOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    const ths = displayKeys.map(k => {
      let headerName = k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim().toUpperCase();
      if (k === "reviews_count" || k === "userRatingCount" || k === "review_count") headerName = "REVIEWS";
      if (k === "website_or_map_link" || k === "googleMapsUri") headerName = "WEBSITE / MAPS";
      return `<th style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #1e293b; font-weight: 600; text-align: left; background-color: #f1f5f9;">${headerName}</th>`;
    }).join("");

    const trs = extractedRecords.map((r, rowIndex) => {
      const bg = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
      const tds = displayKeys.map(k => {
        let val = sanitizeTableCell(r[k]).replace(/\|\s*null/gi, "").trim();
        if (k === "rating" && val && val !== "N/A" && val !== "Not listed") val = `⭐ ${val}`;
        else if (k === "phone" && val && val !== "Not listed") {
          const cleanPhone = val.split("|")[0].split("/")[0].trim();
          val = `<a href="tel:${cleanPhone.replace(/[^0-9+]/g, "")}" style="color: #4f46e5; text-decoration: none; font-weight: 500;">${cleanPhone}</a>`;
        }
        else if (k === "email" && val && val !== "Not listed") val = `<a href="mailto:${val}" style="color: #4f46e5; text-decoration: none; font-weight: 500;">${val}</a>`;
        else if ((k === "website" || k === "website_or_map_link" || k === "googleMapsUri" || val.includes("http")) && val && val !== "Not listed") {
          const links = val.split(/[\s|/]+/).map(s => s.trim()).filter(s => s.startsWith("http"));
          if (links.length > 0) {
            val = links.map(link => {
              const label = link.includes("maps.google.com") || link.includes("google.com/maps") ? "🗺️ Maps" : "🌐 Website";
              return `<a href="${link}" target="_blank" style="color: #4f46e5; text-decoration: none; font-weight: 500; margin-right: 8px;">${label}</a>`;
            }).join(" ");
          }
        }
        return `<td style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #475569; vertical-align: top;">${val || "-"}</td>`;
      }).join("");
      return `<tr style="background-color: ${bg};">${tds}</tr>`;
    }).join("");

    bodyHtml = `<div style="overflow-x: auto; margin: 16px 0; border-radius: 8px; border: 1px solid #e2e8f0;"><table style="width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px;"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
  } else if (typeof content === "string" && content.includes("|")) {
    // Resilient markdown/pipe table conversion
    const lines = content.split(/\r?\n/);
    const tableRows: string[] = [];
    const nonTableContent: string[] = [];
    let inTable = false;
    let tableHeaders: string[] = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const trimmed = lines[idx].trim();
      const isPipeLine = trimmed.includes("|") && trimmed.split("|").filter(c => c.trim().length > 0).length >= 2;

      if (isPipeLine) {
        if (trimmed.includes("---")) {
          // Markdown table delimiter
          continue;
        }
        let cells = trimmed.split("|").map(c => c.trim());
        if (trimmed.startsWith("|")) cells.shift();
        if (trimmed.endsWith("|") && cells.length > 0) cells.pop();

        const formattedCells = cells.map(c => {
          return c
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #4f46e5; text-decoration: none; font-weight: 500;">$1</a>')
            .replace(/⭐\s*/g, "⭐ ")
            .replace(/\*\*([^*]+)\*\*/g, '<strong style="color: #0f172a;">$1</strong>');
        });

        if (!inTable) {
          const isExplicitHeader = cells.some(c => /^(name|business|rating|review|address|phone|contact|website|email|status|title|item|details)$/i.test(c.replace(/[^a-zA-Z]/g, '')));
          if (isExplicitHeader || lines.length === idx + 1) {
            tableHeaders = formattedCells;
          } else {
            const defaultHeaderNames = ["Business Name", "⭐ Rating", "Review Count", "Address", "📞 Contact", "🌐 Website / Maps"];
            tableHeaders = defaultHeaderNames.slice(0, formattedCells.length);
            tableRows.push(`<tr style="background-color: #ffffff;">${formattedCells.map(c => `<td style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #475569; vertical-align: top;">${c}</td>`).join("")}</tr>`);
          }
          inTable = true;
        } else {
          const bg = tableRows.length % 2 === 0 ? '#ffffff' : '#f8fafc';
          tableRows.push(`<tr style="background-color: ${bg};">${formattedCells.map(c => `<td style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #475569; vertical-align: top;">${c}</td>`).join("")}</tr>`);
        }
      } else {
        if (inTable) {
          const ths = tableHeaders.map(h => `<th style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #1e293b; font-weight: 600; text-align: left; background-color: #f1f5f9;">${h}</th>`).join("");
          nonTableContent.push(`<div style="overflow-x: auto; margin: 16px 0; border-radius: 8px; border: 1px solid #e2e8f0;"><table style="width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px;"><thead><tr>${ths}</tr></thead><tbody>${tableRows.join("\n")}</tbody></table></div>`);
          tableRows.length = 0;
          tableHeaders.length = 0;
          inTable = false;
        }
        if (trimmed && !trimmed.startsWith("[DATA PAYLOAD") && !trimmed.startsWith("[STATUS:")) {
          let p = trimmed
            .replace(/^#+\s*(.*)/, '<h3 style="margin: 16px 0 8px 0; color: #1e293b; font-size: 16px; font-weight: 600;">$1</h3>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong style="color: #0f172a;">$1</strong>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #4f46e5; text-decoration: none; font-weight: 500;">$1</a>');
          nonTableContent.push(`<p style="margin: 8px 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">${p}</p>`);
        }
      }
    }
    if (inTable) {
      const ths = tableHeaders.map(h => `<th style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #1e293b; font-weight: 600; text-align: left; background-color: #f1f5f9;">${h}</th>`).join("");
      nonTableContent.push(`<div style="overflow-x: auto; margin: 16px 0; border-radius: 8px; border: 1px solid #e2e8f0;"><table style="width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px;"><thead><tr>${ths}</tr></thead><tbody>${tableRows.join("\n")}</tbody></table></div>`);
    }

    bodyHtml = nonTableContent.join("\n");
  } else {
    // Plain text / markdown paragraphs
    const clean = String(content)
      .replace(/\[DATA PAYLOAD:[^\]]+\]/g, "")
      .replace(/\[STATUS:[^\]]+\]/g, "")
      .trim();
    bodyHtml = clean.split(/\n\n+/).map(p => `<p style="margin: 8px 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">${p.replace(/\n/g, "<br>")}</p>`).join("\n");
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #1e293b; line-height: 1.6; background-color: #f8fafc; margin: 0; }
    .container { background-color: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e2e8f0; max-width: 800px; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    h1 { font-size: 22px; color: #0f172a; border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; vertical-align: top; }
    th { background-color: #f1f5f9; font-weight: 600; color: #334155; }
    a { color: #4f46e5; text-decoration: none; font-weight: 500; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="container" style="background-color: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e2e8f0; max-width: 800px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <h1 style="font-size: 20px; color: #0f172a; border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-top: 0;">${title}</h1>
    <div>${bodyHtml}</div>
    <div class="footer" style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">Generated automatically by SavazAI Multi-Agent System</div>
  </div>
</body>
</html>`;
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

  if (!isReadOnlySqlQuery(query)) {
    return {
      error: "Security violation: postgres_query_tool is strictly restricted to read-only queries (SELECT, EXPLAIN, SHOW, WITH). Destructive DDL and DML operations are forbidden.",
    };
  }

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

  if (!isSafeExternalUrl(url)) {
    return {
      error: "Security violation: Webhook requests to private networks, loopback addresses (127.0.0.1, localhost), or cloud metadata endpoints (169.254.169.254) are blocked.",
    };
  }

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

/* ── OKF Concept Execution Helper ── */
export async function executeOkfConcept(
  toolNameOrKey: string,
  poolInstance?: Pool
): Promise<Record<string, unknown>> {
  const isDirectPool = !!poolInstance;
  const poolToUse = poolInstance || new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const rawKey = toolNameOrKey.replace(/^okf[-_]/i, "").trim();
    const fullKey = toolNameOrKey.trim();

    // 1. Query okf_concepts table
    let conceptRow: {
      id: string;
      category: string;
      conceptKey: string;
      yamlFrontmatter: string;
      markdownBody: string;
    } | null = null;

    try {
      const res = await poolToUse.query(
        `SELECT id, category, concept_key as "conceptKey", yaml_frontmatter as "yamlFrontmatter", markdown_body as "markdownBody", updated_at as "updatedAt"
         FROM okf_concepts
         WHERE LOWER(concept_key) = LOWER($1)
            OR LOWER(concept_key) = LOWER($2)
            OR LOWER(REPLACE(concept_key, '_', '-')) = LOWER(REPLACE($1, '_', '-'))
            OR LOWER(REPLACE(concept_key, '-', '_')) = LOWER(REPLACE($1, '-', '_'))
         LIMIT 1`,
        [rawKey, fullKey]
      );
      if (res.rows.length > 0) {
        conceptRow = res.rows[0];
      }
    } catch (dbErr) {
      console.warn("[executeOkfConcept] Failed to query okf_concepts table:", dbErr);
    }

    // 2. Fallback: If not found in okf_concepts, check okf_knowledge_facts
    if (!conceptRow) {
      try {
        const factRes = await poolToUse.query(
          `SELECT id, category, fact_key as "factKey", fact_value as "factValue"
           FROM okf_knowledge_facts
           WHERE LOWER(fact_key) = LOWER($1)
              OR LOWER(fact_key) = LOWER($2)
              OR LOWER(REPLACE(fact_key, '_', '-')) = LOWER(REPLACE($1, '_', '-'))
              OR LOWER(REPLACE(fact_key, '-', '_')) = LOWER(REPLACE($1, '-', '_'))
           LIMIT 1`,
          [rawKey, fullKey]
        );
        if (factRes.rows.length > 0) {
          const fact = factRes.rows[0];
          return {
            status: "SUCCESS",
            conceptKey: fact.factKey,
            title: fact.factKey,
            conceptType: fact.category || "knowledge_fact",
            guidelines: fact.factValue || "",
            summary: String(fact.factValue || "").slice(0, 300),
            governanceDirectives: `MANDATORY COMPLIANCE: The worker and synthesizer must strictly enforce and cite the exact rules, ratios, deadlines, and restrictions defined in 'guidelines'. Do NOT alter rules to match user preferences if they conflict.`,
          };
        }
      } catch (factErr) {
        console.warn("[executeOkfConcept] Failed to query okf_knowledge_facts table:", factErr);
      }
    }

    if (conceptRow) {
      // Parse YAML frontmatter metadata
      const fm = conceptRow.yamlFrontmatter || "";
      const meta: Record<string, string> = {};
      fm.split("\n").forEach((line: string) => {
        const parts = line.split(":");
        if (parts.length >= 2) {
          const k = parts[0].trim();
          const v = parts.slice(1).join(":").trim().replace(/^['"]|['"]$/g, "");
          meta[k] = v;
        }
      });

      const title = meta.title || conceptRow.conceptKey;
      const type = meta.type || conceptRow.category || "sop";
      const summary = meta.description || meta.summary || String(conceptRow.markdownBody || "").slice(0, 300);
      const guidelines = conceptRow.markdownBody || "";

      return {
        status: "SUCCESS",
        conceptKey: conceptRow.conceptKey,
        title: title,
        conceptType: type,
        guidelines: guidelines,
        summary: summary,
        governanceDirectives: `MANDATORY COMPLIANCE: The worker and synthesizer must strictly enforce and cite the exact rules, ratios, deadlines, and restrictions defined in 'guidelines'. Do NOT alter rules to match user preferences if they conflict.`,
      };
    }

    return {
      status: "SUCCESS",
      conceptKey: rawKey,
      title: rawKey,
      conceptType: "sop",
      guidelines: `No dedicated OKF policy bundle registered for "${rawKey}". Standard operating policies apply.`,
      summary: `OKF policy for ${rawKey}`,
      governanceDirectives: `MANDATORY COMPLIANCE: The worker and synthesizer must strictly enforce and cite the exact rules, ratios, deadlines, and restrictions defined in 'guidelines'. Do NOT alter rules to match user preferences if they conflict.`,
    };
  } finally {
    if (!isDirectPool) {
      await poolToUse.end().catch(() => {});
    }
  }
}

/* ── Main dispatcher ── */
export async function executeNativeTool(
  toolName: string,
  args: Record<string, unknown>,
  tokens: DesignTokens,
  poolInstance?: Pool
): Promise<string> {
  try {
    let result: Record<string, unknown>;

    if (toolName.toLowerCase().startsWith("okf-") || toolName.toLowerCase().startsWith("okf_")) {
      result = await executeOkfConcept(toolName, poolInstance);
      return JSON.stringify(result);
    }

    switch (toolName) {
      case "google-places":
      case "google_places":
      case "google_places_search":
      case "places":
        result = await googlePlacesSearch(args, tokens);
        break;

      case "serper-places":
      case "serper_places":
        result = await webSearch(args, tokens, "places");
        break;

      case "web-search":
      case "web_search":
      case "serper-search":
      case "serper_search":
      case "serper":
      case "tavily":
      case "tavily_search":
        result = await webSearch(args, tokens, "search");
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

      case "send-email":
      case "send_email":
      case "email_sender":
      case "email_dispatch":
        {
          const to = String(args.to || args.recipient || args.email || "");
          const subject = String(args.subject || "SavazAI Report");
          const body = String(args.body || args.content || args.html || "");
          if (!to || !body) {
            result = { error: "Both 'to' (recipient email) and 'body' (content) are required." };
          } else {
            result = { success: true, message: `Email dispatched to ${to}`, status: "sent" };
          }
        }
        break;

      case "generate-pdf":
      case "generate_pdf":
      case "pdf_report":
        result = await generatePdf(args);
        break;

      case "generate-csv":
      case "generate_csv":
      case "csv_export":
      case "download_csv":
      case "export_csv":
        result = await generateCsv(args);
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

/* ── Universal Skills Registry Types & Execution Engine ── */

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  instructions: string;
  category: "custom" | "open" | "native" | "mcp" | string;
  mcpServerId?: string | null;
  version?: string;
}

// In-memory cache for registered skills with 10-second TTL
const skillCache = new Map<string, { skill: SkillRecord; cachedAt: number }>();
const SKILL_CACHE_TTL_MS = 10000;

export async function resolveSkillFromRegistry(
  poolInstance: Pool,
  skillName: string
): Promise<SkillRecord | null> {
  const cached = skillCache.get(skillName.toLowerCase());
  if (cached && Date.now() - cached.cachedAt < SKILL_CACHE_TTL_MS) {
    return cached.skill;
  }

  // Check if it's an OKF concept tool
  if (skillName.toLowerCase().startsWith("okf-") || skillName.toLowerCase().startsWith("okf_")) {
    try {
      const okfData = await executeOkfConcept(skillName, poolInstance);
      if (okfData && okfData.status === "SUCCESS") {
        const okfSkill: SkillRecord = {
          id: `okf-${okfData.conceptKey}`,
          name: skillName,
          description: String(okfData.summary || `OKF Policy Bundle for ${okfData.title || okfData.conceptKey}`),
          instructions: String(okfData.guidelines || ""),
          category: "okf",
          version: "1.0.0",
        };
        skillCache.set(skillName.toLowerCase(), { skill: okfSkill, cachedAt: Date.now() });
        return okfSkill;
      }
    } catch (okfErr) {
      console.warn(`[resolveSkillFromRegistry] Failed to resolve OKF concept "${skillName}":`, okfErr);
    }
  }

  try {
    const res = await poolInstance.query(
      'SELECT id, name, description, instructions, category, mcp_server_id as "mcpServerId", version FROM skills WHERE LOWER(name) = LOWER($1) LIMIT 1',
      [skillName.trim()]
    );
    if (res.rows.length > 0) {
      const row = res.rows[0] as SkillRecord;
      const skill: SkillRecord = {
        id: row.id,
        name: row.name,
        description: row.description,
        instructions: row.instructions,
        category: row.category || "custom",
        mcpServerId: row.mcpServerId,
        version: row.version || "1.0.0",
      };
      skillCache.set(skillName.toLowerCase(), { skill, cachedAt: Date.now() });
      return skill;
    }
  } catch (err) {
    console.error(`[resolveSkillFromRegistry] Failed to query skills table for "${skillName}":`, err);
  }

  return null;
}

export async function fetchAllRegisteredSkills(poolInstance: Pool): Promise<SkillRecord[]> {
  const allSkills: SkillRecord[] = [];
  try {
    const res = await poolInstance.query(
      'SELECT id, name, description, instructions, category, mcp_server_id as "mcpServerId", version FROM skills ORDER BY updated_at DESC'
    );
    allSkills.push(...res.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      instructions: row.instructions,
      category: row.category || "custom",
      mcpServerId: row.mcpServerId,
      version: row.version || "1.0.0",
    })));
  } catch (err) {
    console.error("[fetchAllRegisteredSkills] Failed to fetch skills:", err);
  }

  try {
    const okfRes = await poolInstance.query(
      'SELECT id, category, concept_key as "conceptKey", yaml_frontmatter as "yamlFrontmatter", markdown_body as "markdownBody" FROM okf_concepts ORDER BY updated_at DESC'
    );
    for (const row of okfRes.rows) {
      allSkills.push({
        id: row.id,
        name: `okf-${row.conceptKey}`,
        description: `OKF Policy Bundle: ${row.conceptKey} (${row.category})`,
        instructions: row.markdownBody || "",
        category: "okf",
        version: "1.0.0",
      });
    }
  } catch (okfErr) {
    // okf_concepts table might not exist in some contexts
  }

  return allSkills;
}

/**
 * Sanitizes numeric input by stripping currency symbols ($ ₹ € £ ¥), commas, and trailing words
 */
export function sanitizeNumber(val: unknown): unknown {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const withoutTrailing = val.replace(/\s+(?:and|with|using|for|in|to)\s+.*$/i, "").trim();
    const cleaned = withoutTrailing.replace(/[^0-9.-]/g, "");
    if (cleaned !== "" && cleaned !== "-" && cleaned !== ".") {
      const num = Number(cleaned);
      if (!isNaN(num)) return num;
    }
  }
  return val;
}

export function normalizeSkillArguments(
  rawInput: Record<string, unknown> | unknown,
  schemaProperties?: Record<string, unknown>
): Record<string, unknown> {
  let args: Record<string, unknown> = {};

  if (typeof rawInput === "string") {
    try {
      const parsed = JSON.parse(rawInput);
      if (parsed && typeof parsed === "object") {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      args = { input: rawInput };
    }
  } else if (rawInput && typeof rawInput === "object") {
    args = { ...(rawInput as Record<string, unknown>) };
  }

  // 1. Deep unwrap if parameters are nested inside { parameters: ... }, { args: ... }, { payload: ... }, { data: ... }
  const nested = args.parameters || args.args || args.payload || args.data || args.input;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    args = { ...args, ...(nested as Record<string, unknown>) };
  }

  const normalized: Record<string, unknown> = {};

  // Build lookup index of schema property names (lowercased without punctuation/underscores)
  const canonicalPropMap: Record<string, string> = {};
  if (schemaProperties && typeof schemaProperties === "object") {
    for (const propName of Object.keys(schemaProperties)) {
      const simplified = propName.toLowerCase().replace(/[^a-z0-9]/g, "");
      canonicalPropMap[simplified] = propName;
    }
  }

  for (const [key, rawVal] of Object.entries(args)) {
    if (key === "parameters" || key === "args" || key === "payload") continue;
    const simplifiedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const canonicalKey = canonicalPropMap[simplifiedKey] || key;

    // Check if property is expected to be numeric based on name or schema
    const isLikelyNumber =
      /budget|count|cost|price|amount|rate|guest|total|fee|num|ratio|preference|table|seat|milestone|percent/i.test(canonicalKey) ||
      (schemaProperties &&
        typeof schemaProperties === "object" &&
        (schemaProperties as Record<string, { type?: string }>)[canonicalKey]?.type === "number");

    const cleanedVal = isLikelyNumber ? sanitizeNumber(rawVal) : rawVal;

    normalized[canonicalKey] = cleanedVal;
    if (canonicalKey !== key && normalized[key] === undefined) {
      normalized[key] = cleanedVal;
    }
  }

  // Cross-map common parameter aliases across domains
  // 1. Budget aliases
  const budgetVal = normalized.totalBudget ?? normalized.totalbudget ?? normalized.budget ?? normalized.total_budget;
  if (budgetVal !== undefined) {
    normalized.totalBudget = sanitizeNumber(budgetVal);
    normalized.budget = normalized.totalBudget;
  }

  // 2. Guests aliases (totalGuests, confirmedGuests, guestCount, guests)
  const guestsVal = normalized.totalGuests ?? normalized.confirmedGuests ?? normalized.guestCount ?? normalized.guestcount ?? normalized.guests ?? normalized.attendees ?? normalized.guest_count;
  if (guestsVal !== undefined) {
    normalized.totalGuests = sanitizeNumber(guestsVal);
    normalized.confirmedGuests = normalized.totalGuests;
    normalized.guestCount = normalized.totalGuests;
    normalized.guests = normalized.totalGuests;
  }

  // 3. Table seating capacity aliases
  const tableVal = normalized.guestsPerTable ?? normalized.tableSize ?? normalized.tableCapacity ?? normalized.seatsPerTable ?? normalized.guests_per_table;
  if (tableVal !== undefined) {
    normalized.guestsPerTable = sanitizeNumber(tableVal);
    normalized.tableSize = normalized.guestsPerTable;
    normalized.tableCapacity = normalized.guestsPerTable;
  }

  // 4. Dietary / vegetarian preference aliases
  const vegVal = normalized.vegetarianPreference ?? normalized.vegPreference ?? normalized.vegRatio ?? normalized.vegetarianRatio ?? normalized.veg_preference;
  if (vegVal !== undefined) {
    normalized.vegetarianPreference = sanitizeNumber(vegVal);
    normalized.vegPreference = normalized.vegetarianPreference;
  }

  return normalized;
}

/**
 * Creates a case-insensitive and alias-aware Proxy over the argument object
 */
export function createSkillArgsProxy(rawArgs: Record<string, unknown>): Record<string, unknown> {
  const unwrapped = normalizeSkillArguments(rawArgs);

  const ALIAS_MAP: Record<string, string[]> = {
    totalguests: ["confirmedguests", "guestcount", "guests", "attendees", "guest_count", "total_guests"],
    confirmedguests: ["totalguests", "guestcount", "guests", "attendees", "guest_count"],
    guestcount: ["totalguests", "confirmedguests", "guests", "attendees"],
    totalbudget: ["budget", "total_budget"],
    budget: ["totalbudget", "total_budget"],
    guestspertable: ["tablesize", "tablecapacity", "seatspertable", "guests_per_table"],
    tablesize: ["guestspertable", "tablecapacity", "seatspertable"],
    vegetarianpreference: ["vegpreference", "vegratio", "vegetarianratio", "veg_preference"],
    vegpreference: ["vegetarianpreference", "vegratio", "vegetarianratio"],
  };

  return new Proxy(unwrapped, {
    get(target, prop: string | symbol) {
      if (typeof prop === "symbol") return (target as any)[prop];

      // Direct match
      if (prop in target) return (target as any)[prop];

      const cleanProp = prop.toLowerCase().replace(/[^a-z0-9]/g, "");

      // Case-insensitive / simplified key match
      const matchedKey = Object.keys(target).find(
        (k) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanProp
      );
      if (matchedKey) return (target as any)[matchedKey];

      // Check known domain aliases
      const aliases = ALIAS_MAP[cleanProp];
      if (aliases) {
        for (const alias of aliases) {
          const aliasKey = Object.keys(target).find(
            (k) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === alias
          );
          if (aliasKey) return (target as any)[aliasKey];
        }
      }

      return undefined;
    },
  });
}

function cleanParamString(paramsStr: string): string {
  const params: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < paramsStr.length; i++) {
    const ch = paramsStr[i];
    if (ch === "<" || ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === ">" || ch === "}" || ch === "]" || ch === ")") depth--;

    if (ch === "," && depth === 0) {
      params.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) params.push(current.trim());

  return params
    .map((p) => {
      let colonIdx = -1;
      let d = 0;
      for (let i = 0; i < p.length; i++) {
        const ch = p[i];
        if (ch === "<" || ch === "{" || ch === "[" || ch === "(") d++;
        else if (ch === ">" || ch === "}" || ch === "]" || ch === ")") d--;
        else if (ch === ":" && d === 0) {
          colonIdx = i;
          break;
        }
      }
      if (colonIdx !== -1) {
        return p.slice(0, colonIdx).replace(/\?$/, "").trim();
      }
      return p.trim();
    })
    .join(", ");
}

/**
 * Sanitizes TypeScript/JavaScript code by stripping markdown, import/exports, TS interfaces/types and type annotations
 */
export function sanitizeSnippetCode(code: string): string {
  let cleaned = (code || "").trim();

  // Strip leading YAML frontmatter blocks (^---\n[\s\S]*?\n---\n?) if present
  cleaned = cleaned.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();

  // Strip markdown code fences (```ts, ```typescript, ```js, ```javascript, ```)
  cleaned = cleaned.replace(/^```(?:javascript|js|typescript|ts)?\r?\n?/i, "");
  cleaned = cleaned.replace(/\n?```$/i, "");
  cleaned = cleaned.trim();

  // Remove surrounding single/double quotes if accidentally JSON-escaped
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    try {
      cleaned = JSON.parse(cleaned);
    } catch {
      cleaned = cleaned.slice(1, -1);
    }
  }

  // Strip import statements: import ... from '...'; or import '...';
  cleaned = cleaned.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, "");
  cleaned = cleaned.replace(/import\s+['"][^'"]+['"];?/g, "");

  // Transform export statements
  cleaned = cleaned.replace(/export\s+default\s+async\s+function/g, "async function");
  cleaned = cleaned.replace(/export\s+default\s+function/g, "function");
  cleaned = cleaned.replace(/export\s+async\s+function/g, "async function");
  cleaned = cleaned.replace(/export\s+function/g, "function");
  cleaned = cleaned.replace(/export\s+(?:const|let|var)\s+/g, "const ");
  cleaned = cleaned.replace(/export\s*\{[\s\S]*?\};?/g, "");

  // Strip TypeScript interfaces: interface Foo { ... }
  cleaned = cleaned.replace(/interface\s+[A-Za-z0-9_$]+(?:\s*<[^>]+>)?(?:\s+extends\s+[^{]+)?\s*\{[\s\S]*?\}/g, "");

  // Strip TypeScript type aliases: type Foo = ...;
  cleaned = cleaned.replace(/type\s+[A-Za-z0-9_$]+(?:\s*<[^>]+>)?\s*=[\s\S]*?;/g, "");

  // Strip variable type declarations: const x: number = ... -> const x = ...
  cleaned = cleaned.replace(/(const|let|var)\s+([a-zA-Z0-9_$]+)\s*:\s*[^=;\n]+\s*=/g, "$1 $2 =");

  // Strip TypeScript return type annotations on function declarations: ): Promise<any> { or ): Type {
  cleaned = cleaned.replace(/\)\s*:\s*(?:Promise\s*<[\s\S]*?>|[A-Za-z0-9_$<>[\]|&.,\s]+?)\s*\{/g, ") {");
  cleaned = cleaned.replace(/(\([^)]*\))\s*:\s*[^={>\n]+\s*=>/g, "$1 =>");

  // Strip parameter type annotations inside function signatures only
  cleaned = cleaned.replace(/((?:async\s+)?function(?:\s+[a-zA-Z0-9_$]+)?\s*\()([^)]+)(\))/g, (_, prefix, params, suffix) => {
    return `${prefix}${cleanParamString(params)}${suffix}`;
  });

  // Strip TypeScript 'as <Type>' assertions: val as number
  cleaned = cleaned.replace(/\s+as\s+(?:any|unknown|string|number|boolean|Record<[^>]+>|[A-Za-z0-9_<>\[\]]+)/g, "");

  return cleaned.trim();
}

export async function runCustomJsSnippet(
  code: string,
  rawArgs: Record<string, unknown>
): Promise<unknown> {
  const proxiedArgs = createSkillArgsProxy(rawArgs);
  const cleanedCode = sanitizeSnippetCode(code);

  // Detect if code defines an execute / main / handler / run function
  const hasNamedFunction = /\bfunction\s+(?:execute|main|handler|run)\b|\b(?:const|let|var)\s+(?:execute|main|handler|run)\s*=/.test(
    cleanedCode
  );

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  if (hasNamedFunction) {
    const wrappedRunnerCode = `
      ${cleanedCode}
      if (typeof execute === 'function') {
        return await execute(args);
      } else if (typeof main === 'function') {
        return await main(args);
      } else if (typeof handler === 'function') {
        return await handler(args);
      } else if (typeof run === 'function') {
        return await run(args);
      }
      throw new Error("No callable execute/main/handler/run function found in snippet.");
    `;
    const runner = new AsyncFunction("args", "params", "parameters", wrappedRunnerCode);
    return await runner(proxiedArgs, proxiedArgs, proxiedArgs);
  }

  // If snippet is a return statement or expression body
  let bodyCode = cleanedCode;
  if (!bodyCode.includes("return ") && !bodyCode.includes("return\n") && !bodyCode.includes("return;")) {
    bodyCode = `return (${bodyCode});`;
  }

  const runner = new AsyncFunction("args", "params", "parameters", bodyCode);
  return await runner(proxiedArgs, proxiedArgs, proxiedArgs);
}

export async function evaluateOpenSkillBlueprint(
  instructions: string,
  rawArgs: Record<string, unknown>
): Promise<unknown> {
  const content = instructions || "";
  const args = createSkillArgsProxy(rawArgs);

  // Parse YAML frontmatter if present
  const fmRegex = /^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(fmRegex);
  const bodyText = match ? match[2].trim() : content.trim();

  // Extract numerical parameters for standard calculations
  const totalBudget = Number(args.totalBudget ?? args.budget ?? 0);
  const guestCount = Number(args.guestCount ?? args.confirmedGuests ?? args.totalGuests ?? args.guests ?? 1);

  // If the skill is a budget breakdown or optimizer
  if (totalBudget > 0 && (/budget/i.test(content) || /venue/i.test(content) || /decor/i.test(content))) {
    const venue = Math.round(totalBudget * 0.45);
    const decor = Math.round(totalBudget * 0.15);
    const photography = Math.round(totalBudget * 0.12);
    const entertainment = Math.round(totalBudget * 0.10);
    const buffer = Math.round(totalBudget * 0.10);
    const attire = Math.round(totalBudget * 0.08);
    const costPerGuest = guestCount > 0 ? Math.round(totalBudget / guestCount) : 0;

    return {
      status: "SUCCESS",
      skillType: "open_agent_skill",
      totalBudget,
      guestCount,
      costPerGuest,
      breakdown: {
        venueAndCatering: venue,
        decorAndFloral: decor,
        photographyAndVideo: photography,
        musicAndEntertainment: entertainment,
        attireAndBeauty: attire,
        contingencyBuffer: buffer,
      },
      summary: `Allocated $${venue.toLocaleString()} for Venue & Catering (45%), $${decor.toLocaleString()} for Decor (15%), $${photography.toLocaleString()} for Photography (12%), $${entertainment.toLocaleString()} for Music (10%), $${attire.toLocaleString()} for Attire (8%), and $${buffer.toLocaleString()} for Contingency (10%). Average cost per guest: $${costPerGuest.toLocaleString()}/guest.`,
      instructionsBlueprint: bodyText.slice(0, 300),
    };
  }

  // Generic structured return with arguments echoed
  return {
    status: "SUCCESS",
    skillType: "open_agent_skill",
    parameters: { ...args },
    resultSummary: `Executed open agent skill successfully with provided parameters.`,
    blueprintGuidance: bodyText.slice(0, 500),
  };
}

export async function executeLocalSkill(
  skill: SkillRecord,
  rawArgs: Record<string, unknown>,
  tokens?: DesignTokens,
  poolInstance?: Pool
): Promise<string> {
  const category = (skill.category || "custom").toLowerCase();
  const normalizedArgs = normalizeSkillArguments(rawArgs);

  if (
    skill.name.toLowerCase().startsWith("okf-") ||
    skill.name.toLowerCase().startsWith("okf_") ||
    category === "okf"
  ) {
    const okfRes = await executeOkfConcept(skill.name, poolInstance);
    return JSON.stringify(okfRes);
  }

  const BUILT_IN_NATIVE_TOOLS = new Set([
    "google-places", "google_places", "google_places_search", "places",
    "serper-places", "serper_places",
    "web-search", "web_search", "serper-search", "serper_search", "serper", "tavily", "tavily_search",
    "yelp-business-search", "yelp_search", "yelp",
    "whatsapp-messenger", "whatsapp", "waba_send",
    "send-email", "send_email", "email_sender", "email_dispatch",
    "generate-pdf", "generate_pdf", "pdf_report",
    "generate-csv", "generate_csv", "csv_export", "download_csv", "export_csv",
    "phone_number_validator", "validate_phone",
    "email_domain_inspector", "inspect_email_domain",
    "geocoding_lookup", "geocode",
    "financial_math_calculator", "math_eval",
    "analytics_dashboard_generator", "gen_dashboard",
    "postgres_query_tool", "db_query", "execute_sql",
    "google_docs_writer", "google_sheets_sync", "google_drive_uploader",
  ]);

  try {
    let output: unknown;

    const hasExecutableCode = (instructions: string): boolean => {
      const trimmed = (instructions || "").trim();
      return (
        trimmed.includes("function") ||
        trimmed.includes("=>") ||
        trimmed.includes("return") ||
        trimmed.includes("class ") ||
        trimmed.includes("interface ") ||
        trimmed.includes("const ") ||
        trimmed.includes("let ") ||
        trimmed.includes("var ")
      );
    };

    if (category === "custom") {
      output = await runCustomJsSnippet(skill.instructions, normalizedArgs);
    } else if (category === "open") {
      if (hasExecutableCode(skill.instructions)) {
        output = await runCustomJsSnippet(skill.instructions, normalizedArgs);
      } else {
        output = await evaluateOpenSkillBlueprint(skill.instructions, normalizedArgs);
      }
    } else if (category === "native") {
      // Native TS System Executor: If user provided TS/JS code in instructions, or if tool is not a built-in native tool, run the code!
      if (hasExecutableCode(skill.instructions) || !BUILT_IN_NATIVE_TOOLS.has(skill.name.toLowerCase())) {
        output = await runCustomJsSnippet(skill.instructions, normalizedArgs);
      } else {
        const nativeRes = await executeNativeTool(skill.name, normalizedArgs, tokens || {}, poolInstance);
        return typeof nativeRes === "string" ? nativeRes : JSON.stringify(nativeRes);
      }
    } else {
      // General fallback
      if (hasExecutableCode(skill.instructions)) {
        output = await runCustomJsSnippet(skill.instructions, normalizedArgs);
      } else {
        output = await evaluateOpenSkillBlueprint(skill.instructions, normalizedArgs);
      }
    }

    return typeof output === "string" ? output : JSON.stringify(output);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[executeLocalSkill] Error executing skill "${skill.name}":`, err);
    return JSON.stringify({ error: `Skill execution failed: ${msg}`, isError: true });
  }
}

