/**
 * @module governance/masking
 * @description Production-hardened PII masking gateway with SHA-256 reference tokens,
 * category-level analytics, configurable pattern registration, and audit logging.
 * Wraps and extends the existing PrivacyGateway from src/utils/privacy-gateway.ts.
 */

import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PIICategoryCount {
  type: string;
  count: number;
  label: string;
}

export interface GovernanceMaskingResult {
  maskedText: string;
  tokenMap: Map<string, string>;
  categories: PIICategoryCount[];
}

interface MaskingPattern {
  regex: RegExp;
  label: string;
}

// ---------------------------------------------------------------------------
// Default PII detection patterns (backward-compatible with PrivacyGateway)
// ---------------------------------------------------------------------------

const DEFAULT_PATTERNS: MaskingPattern[] = [
  { regex: /[\w.-]+@[\w.-]+\.\w+/g, label: "email" },
  { regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, label: "phone" },
  { regex: /\b\d{3}-\d{2}-\d{4}\b/g, label: "ssn" },
  { regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, label: "card" },
  { regex: /\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b/g, label: "currency" },
  { regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, label: "ip" },
  { regex: /"token_[a-zA-Z0-9_]+"/g, label: "token" },
  { regex: /\b(id|uuid|guid)[:_]\s*["']?[a-zA-Z0-9_-]{8,}["']?/gi, label: "id" },
];

// ---------------------------------------------------------------------------
// GovernanceMaskingGateway
// ---------------------------------------------------------------------------

export class GovernanceMaskingGateway {
  private patterns: MaskingPattern[];
  private auditLogPath: string;

  constructor(patterns?: MaskingPattern[], logsDir?: string) {
    // Clone defaults to avoid shared-mutable-regex state across instances
    this.patterns = patterns
      ? patterns.map((p) => ({ regex: new RegExp(p.regex.source, p.regex.flags), label: p.label }))
      : DEFAULT_PATTERNS.map((p) => ({ regex: new RegExp(p.regex.source, p.regex.flags), label: p.label }));

    // Resolve logs directory — strict ./logs/ isolation per AGENTS.md Rule 9
    const baseDir = logsDir ?? resolve(process.cwd(), "logs");
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
    this.auditLogPath = resolve(baseDir, "governance-masking-audit.log");
  }

  /**
   * Register an additional PII detection pattern at runtime.
   */
  addPattern(regex: RegExp, label: string): void {
    this.patterns.push({ regex: new RegExp(regex.source, regex.flags), label });
  }

  /**
   * Mask all PII in the input text using SHA-256 hashed reference tokens.
   * Returns the masked text, a reversible token map, and per-category counts.
   */
  maskPayload(text: string): GovernanceMaskingResult {
    const tokenMap = new Map<string, string>();
    const categoryCounts = new Map<string, number>();
    let result = text;

    for (const { regex, label } of this.patterns) {
      // Reset regex lastIndex for global regexes
      regex.lastIndex = 0;

      result = result.replace(regex, (match: string) => {
        // Check if this exact value was already tokenized
        const existing = [...tokenMap.entries()].find(([, v]) => v === match);
        if (existing) return existing[0];

        // Generate SHA-256 reference token (first 12 hex chars for readability)
        const hash = createHash("sha256")
          .update(`${label}:${match}:${randomUUID()}`)
          .digest("hex")
          .substring(0, 12);
        const token = `[GOV_${label.toUpperCase()}_${hash}]`;

        tokenMap.set(token, match);
        categoryCounts.set(label, (categoryCounts.get(label) ?? 0) + 1);
        return token;
      });
    }

    const categories: PIICategoryCount[] = [...categoryCounts.entries()].map(
      ([type, count]) => ({ type, count, label: type }),
    );

    // Audit log entry
    this.writeAuditLog("mask", categories);

    return { maskedText: result, tokenMap, categories };
  }

  /**
   * Restore original PII values from masked text using the token map.
   */
  unmaskPayload(text: string, tokenMap: Map<string, string>): string {
    let result = text;
    for (const [token, original] of tokenMap) {
      // Escape special regex characters in token for safe replaceAll
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(escaped, "g"), original);
    }

    // Audit log entry
    this.writeAuditLog("unmask", []);

    return result;
  }

  /**
   * Append a structured audit entry to the governance masking log.
   * All logs are written to ./logs/ per AGENTS.md Rule 9.
   */
  private writeAuditLog(operation: "mask" | "unmask", categories: PIICategoryCount[]): void {
    try {
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        operation,
        categories,
        totalMasked: categories.reduce((sum, c) => sum + c.count, 0),
      });
      appendFileSync(this.auditLogPath, entry + "\n", "utf-8");
    } catch {
      // Silently swallow write errors — masking must never fail due to logging
    }
  }
}
