import { z } from "zod";
import { db } from "../db/index.js";
import { systemConfigurations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { createDecipheriv, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-cbc";

export function decrypt(encryptedText: string): string {
  if (!encryptedText) return "";
  const secret = process.env.MASTER_VAULT_SECRET;
  if (!secret) {
    throw new Error("[decrypt] MASTER_VAULT_SECRET environment variable is not set — cannot decrypt credentials.");
  }
  const key = scryptSync(secret, "salt", 32);
  const parts = encryptedText.split(":");
  if (parts.length < 2) {
    throw new Error("[decrypt] Encrypted text format is invalid (expected iv:ciphertext hex pair).");
  }
  const ivHex = parts[0];
  const encrypted = parts.slice(1).join(":");
  if (!ivHex || !encrypted) {
    throw new Error("[decrypt] Encrypted text has empty IV or ciphertext portion.");
  }
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export const ConfigRegistrySchema = z.object({
  gmailClientId: z.string().optional(),
  gmailClientSecret: z.string().optional(),
  gmailRedirectUri: z.string().optional(),
  OAUTH_REFRESH_TOKEN: z.string().optional(),
  gmailRefreshToken: z.string().optional(),
  gmailAccessToken: z.string().optional(),
  gmailTokenExpiresAt: z.number().optional(),
});

export type ConfigRegistry = z.infer<typeof ConfigRegistrySchema>;

export async function getValidGmailAccessToken(): Promise<string> {
  const configs = await db.select().from(systemConfigurations).limit(1);
  if (configs.length === 0) {
    throw new Error("[getValidGmailAccessToken] No system configuration found in database.");
  }

  const config = configs[0];
  const rawTokens = config.designTokens || {};
  const parsed = ConfigRegistrySchema.safeParse(rawTokens);
  if (!parsed.success) {
    throw new Error(
      `[getValidGmailAccessToken] Config registry validation failed: ${JSON.stringify(parsed.error.errors)}`
    );
  }

  const tokens = parsed.data;
  const clientId = decrypt(tokens.gmailClientId || "");
  const clientSecret = decrypt(tokens.gmailClientSecret || "");
  const refreshToken = decrypt(tokens.OAUTH_REFRESH_TOKEN || tokens.gmailRefreshToken || "");
  const currentAccessToken = tokens.gmailAccessToken;
  const expiresAt = tokens.gmailTokenExpiresAt;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "[getValidGmailAccessToken] Missing OAuth credentials (clientId, clientSecret, or refreshToken) after decryption."
    );
  }

  // Check if token is expired or close to expiring (within 30 seconds buffer)
  const isExpired = !currentAccessToken || !expiresAt || Date.now() >= expiresAt - 30000;

  if (!isExpired) {
    console.log("[ambient-credential-interceptor] Existing access token is still valid.");
    return currentAccessToken;
  }

  console.log("[ambient-credential-interceptor] Access token is expired or missing. Rotating...");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `[getValidGmailAccessToken] OAuth rotation failed (${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  const freshAccessToken = data.access_token;
  const freshExpiresAt = Date.now() + data.expires_in * 1000;

  // Immediately and explicitly commit back to the persistent database
  const updatedTokens = {
    ...(config.designTokens as Record<string, any>),
    gmailAccessToken: freshAccessToken,
    gmailTokenExpiresAt: freshExpiresAt,
  };

  await db
    .update(systemConfigurations)
    .set({ designTokens: updatedTokens })
    .where(eq(systemConfigurations.id, config.id));

  console.log("[ambient-credential-interceptor] Persisted rotated OAuth token successfully.");
  return freshAccessToken;
}

function renderHtmlTable(lines: string[]): string {
  if (lines.length < 2) return "";
  const headerLine = lines[0];
  const bodyLines = lines.slice(2);

  const parseRow = (rowStr: string) => {
    return rowStr
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
  };

  const headers = parseRow(headerLine);
  let tableHtml = '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:14px;border:1px solid #e2e8f0;">';
  tableHtml += '<thead><tr style="background-color:#f1f5f9;">';
  for (const header of headers) {
    tableHtml += `<th style="padding:8px;text-align:left;font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0;background-color:#f1f5f9;">${header}</th>`;
  }
  tableHtml += "</tr></thead><tbody>";

  for (const bodyLine of bodyLines) {
    const cells = parseRow(bodyLine);
    tableHtml += '<tr>';
    for (const cell of cells) {
      tableHtml += `<td style="padding:8px;text-align:left;color:#334155;border-bottom:1px solid #e2e8f0;">${cell}</td>`;
    }
    tableHtml += "</tr>";
  }
  tableHtml += "</tbody></table>";
  return tableHtml;
}

export function markdownToHtml(md: string): string {
  let html = md.replace(/\r\n/g, "\n");

  // Process tables first
  const lines = html.split("\n");
  let inTable = false;
  let tableLines: string[] = [];
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("|") && line.endsWith("|")) {
      if (!inTable) {
        inTable = true;
        tableLines = [];
      }
      tableLines.push(line);
    } else {
      if (inTable) {
        processedLines.push(renderHtmlTable(tableLines));
        inTable = false;
      }
      processedLines.push(lines[i]);
    }
  }
  if (inTable) {
    processedLines.push(renderHtmlTable(tableLines));
  }
  html = processedLines.join("\n");

  // Process images
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<div style="margin: 20px 0; text-align: center;"><img src="$2" alt="$1" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);" /></div>');

  // Process headers
  html = html.replace(/^### (.*?)$/gm, '<h3 style="color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 600; margin: 20px 0 10px 0;">$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2 style="color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; font-size: 18px; font-weight: 600; margin: 24px 0 12px 0; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1 style="color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; font-size: 22px; font-weight: 700; margin: 28px 0 14px 0;">$1</h1>');

  // Process unordered lists
  const listLines = html.split("\n");
  let inList = false;
  const listProcessed: string[] = [];
  for (const line of listLines) {
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      if (!inList) {
        inList = true;
        listProcessed.push('<ul style="margin: 10px 0; padding-left: 20px; list-style-type: disc;">');
      }
      const itemText = line.replace(/^\s*[-*]\s+/, "");
      listProcessed.push(`<li style="color: #334155; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; margin-bottom: 6px;">${itemText}</li>`);
    } else {
      if (inList) {
        inList = false;
        listProcessed.push("</ul>");
      }
      listProcessed.push(line);
    }
  }
  if (inList) {
    listProcessed.push("</ul>");
  }
  html = listProcessed.join("\n");

  // Bold & Italics
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0f172a; font-weight: 600;">$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em style="font-style: italic;">$1</em>');

  // Paragraph tags
  const paraLines = html.split("\n");
  const finalLines: string[] = [];
  for (const line of paraLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      finalLines.push("<br/>");
      continue;
    }
    if (
      trimmed.startsWith("<h") ||
      trimmed.startsWith("<ul") ||
      trimmed.startsWith("<li") ||
      trimmed.startsWith("</ul") ||
      trimmed.startsWith("<table") ||
      trimmed.startsWith("</table") ||
      trimmed.startsWith("<tr") ||
      trimmed.startsWith("</tr") ||
      trimmed.startsWith("<td") ||
      trimmed.startsWith("<th") ||
      trimmed.startsWith("<div") ||
      trimmed.startsWith("</div")
    ) {
      finalLines.push(line);
    } else {
      finalLines.push(`<p style="color: #334155; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; margin: 10px 0;">${line}</p>`);
    }
  }
  return finalLines.join("\n");
}

export function wrapInEmailTemplate(contentHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wedding Status Update</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 20px 0;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05); overflow: hidden; border: 1px solid #e2e8f0;">
          <tr style="background: linear-gradient(135deg, #4f46e5, #06b6d4); color: #ffffff;">
            <td style="padding: 30px 40px; text-align: left;">
              <h1 style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">SavazAI / Wedding Planning Assistant</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px; text-align: left; background-color: #ffffff;">
              ${contentHtml}
            </td>
          </tr>
          <tr style="background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
            <td style="padding: 20px 40px; text-align: center; color: #94a3b8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5;">
              <p style="margin: 0;">This is an automated digest sent to you by your SavazAI workspace.</p>
              <p style="margin: 4px 0 0 0;">&copy; 2026 SavazAI. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

export function convertMarkdownToHtml(markdown: string): string {
  return wrapInEmailTemplate(markdownToHtml(markdown));
}

export function buildMimeMessage(
  recipients: string[],
  subject: string,
  body: string,
  bodyHtml?: string,
): string {
  const toHeader = recipients.join(", ");
  const encodedSubject = `=?utf-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
  const htmlBody = bodyHtml || wrapInEmailTemplate(markdownToHtml(body));

  const mimeParts = [
    `To: ${toHeader}`,
    `Subject: ${encodedSubject}`,
    "Mime-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(htmlBody, "utf-8").toString("base64")
  ];
  const mime = mimeParts.join("\r\n");
  return Buffer.from(mime, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendGmailEmail(
  accessToken: string,
  recipients: string[],
  subject: string,
  body: string,
  bodyHtml?: string,
): Promise<{ id: string }> {
  const raw = buildMimeMessage(recipients, subject, body, bodyHtml);
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`[sendGmailEmail] Gmail API rejected (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as { id: string };
  return { id: data.id };
}
