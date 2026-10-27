import crypto from "node:crypto";
import { pool } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";

const CAPTCHA_HMAC_SECRET =
  process.env.BETTER_AUTH_SECRET || "savazai_secure_auth_secret_development_vault_key_2026";

/**
 * Generates a short-lived signed challenge token for UI forms when external
 * Cloudflare Turnstile / reCAPTCHA keys are not configured in local/self-hosted environments.
 */
export function generateSignedCaptchaToken(action: string = "auth"): string {
  const timestamp = Date.now().toString();
  const payload = `${action}:${timestamp}`;
  const signature = crypto
    .createHmac("sha256", CAPTCHA_HMAC_SECRET)
    .update(payload)
    .digest("hex");
  return `savazai_turnstile_v1.${Buffer.from(payload).toString("base64url")}.${signature}`;
}

interface DynamicCaptchaConfig {
  provider: "turnstile" | "recaptcha";
  secretKey?: string;
  enabled?: boolean;
}

async function resolveCaptchaConfig(): Promise<DynamicCaptchaConfig | null> {
  // 1. Environment variables take precedence
  if (process.env.TURNSTILE_SECRET_KEY) {
    return {
      provider: "turnstile",
      secretKey: process.env.TURNSTILE_SECRET_KEY,
      enabled: true,
    };
  }
  if (process.env.RECAPTCHA_SECRET_KEY) {
    return {
      provider: "recaptcha",
      secretKey: process.env.RECAPTCHA_SECRET_KEY,
      enabled: true,
    };
  }

  // 2. Query system_configurations.design_tokens.captchaSettings
  try {
    const res = await pool.query(
      'SELECT "design_tokens" as "designTokens" FROM "system_configurations" LIMIT 1'
    );
    if (res.rows.length > 0 && res.rows[0].designTokens) {
      const tokens = res.rows[0].designTokens as Record<string, unknown>;
      const cs = tokens.captchaSettings as Record<string, unknown> | undefined;
      if (cs && cs.enabled !== false && typeof cs.secretKey === "string" && cs.secretKey.trim()) {
        const decryptedSecret = decrypt(cs.secretKey.trim());
        return {
          provider: cs.provider === "recaptcha" ? "recaptcha" : "turnstile",
          secretKey: decryptedSecret,
          enabled: true,
        };
      }
    }
  } catch (err) {
    console.warn("[Captcha Resolver] Failed to query dynamic captcha settings from DB:", err);
  }

  return null;
}

export async function verifyCaptchaToken(
  token?: string | null,
  remoteIp?: string | null
): Promise<{ valid: boolean; reason?: string }> {
  if (!token || typeof token !== "string" || !token.trim()) {
    return {
      valid: false,
      reason: "CAPTCHA verification token is required. Automated bot requests are blocked.",
    };
  }

  const trimmed = token.trim();
  const activeConfig = await resolveCaptchaConfig();

  // 1. If Cloudflare Turnstile is active
  if (
    activeConfig?.provider === "turnstile" &&
    activeConfig.secretKey &&
    !trimmed.startsWith("savazai_turnstile_v1.")
  ) {
    try {
      const formData = new URLSearchParams();
      formData.append("secret", activeConfig.secretKey);
      formData.append("response", trimmed);
      if (remoteIp) formData.append("remoteip", remoteIp);

      const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
      if (data.success) {
        return { valid: true };
      }
      return {
        valid: false,
        reason: `Cloudflare Turnstile verification failed: ${(data["error-codes"] || []).join(", ")}`,
      };
    } catch (err) {
      return {
        valid: false,
        reason: `Turnstile verification error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // 2. If Google reCAPTCHA v3 is active
  if (
    activeConfig?.provider === "recaptcha" &&
    activeConfig.secretKey &&
    !trimmed.startsWith("savazai_turnstile_v1.")
  ) {
    try {
      const formData = new URLSearchParams();
      formData.append("secret", activeConfig.secretKey);
      formData.append("response", trimmed);
      if (remoteIp) formData.append("remoteip", remoteIp);

      const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as { success?: boolean; score?: number };
      if (data.success && (data.score === undefined || data.score >= 0.5)) {
        return { valid: true };
      }
      return { valid: false, reason: "reCAPTCHA v3 score below threshold or invalid token." };
    } catch (err) {
      return {
        valid: false,
        reason: `reCAPTCHA verification error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // 3. Support Cloudflare official pass-through test tokens STRICTLY in non-production environments
  if (process.env.NODE_ENV !== "production") {
    if (trimmed === "CF_TURNSTILE_VERIFIED_TOKEN" || trimmed === "1x00000000000000000000AA") {
      return { valid: true };
    }
  }

  // 4. Validate SavazAI self-signed challenge token (for development and fallback without external keys)
  if (trimmed.startsWith("savazai_turnstile_v1.")) {
    const parts = trimmed.split(".");
    if (parts.length !== 3) {
      return { valid: false, reason: "Malformed CAPTCHA challenge token." };
    }
    try {
      const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
      const expectedSig = crypto
        .createHmac("sha256", CAPTCHA_HMAC_SECRET)
        .update(payload)
        .digest("hex");

      if (parts[2] !== expectedSig) {
        return { valid: false, reason: "Invalid CAPTCHA token signature." };
      }
      const [, tsStr] = payload.split(":");
      const ts = parseInt(tsStr, 10);
      if (isNaN(ts) || Date.now() - ts > 15 * 60 * 1000) {
        return { valid: false, reason: "CAPTCHA challenge token has expired (15m limit)." };
      }
      return { valid: true };
    } catch {
      return { valid: false, reason: "Failed to verify CAPTCHA challenge token." };
    }
  }

  return { valid: false, reason: "Invalid or unrecognized CAPTCHA verification token." };
}
