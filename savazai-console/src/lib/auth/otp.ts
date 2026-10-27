import crypto from "node:crypto";
import { pool, ensureAdminProvisioned } from "@/lib/auth";
import { sendEmail } from "@/lib/email/transporter";

export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp.trim()).digest("hex");
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP valid for 10 minutes.
 * Stores the SHA-256 hash in the `verification_token` table and dispatches via email.
 */
export async function generateAndSendEmailOtp(
  email: string,
  purpose: "onboarding" | "password_reset" | "mfa" = "onboarding"
): Promise<{ sent: boolean; expiresInMinutes: number; devOtpPreview?: string }> {
  await ensureAdminProvisioned();
  const cleanEmail = email.trim().toLowerCase();

  // Generate CSPRNG 6-digit numeric code (100000 - 999999)
  const rawOtp = crypto.randomInt(100000, 1000000).toString();
  const hashedToken = hashOtp(rawOtp);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes TTL

  // Delete previous active tokens for this identifier & purpose
  await pool.query(
    'DELETE FROM "verification_token" WHERE LOWER("identifier") = $1 AND "purpose" = $2',
    [cleanEmail, purpose]
  );

  await pool.query(
    `INSERT INTO "verification_token" ("id", "identifier", "token", "purpose", "expiresAt", "attempts", "createdAt")
     VALUES ($1, $2, $3, $4, $5, 0, now())`,
    [id, cleanEmail, hashedToken, purpose, expiresAt.toISOString()]
  );

  // Real Email Dispatch via Nodemailer Transporter with HTML formatting & DB audit logging
  let emailDispatched = false;
  try {
    const cfgRes = await pool.query(
      'SELECT app_title as "appTitle" FROM system_configurations LIMIT 1'
    );
    const appTitle = cfgRes.rows[0]?.appTitle || "SavazAI";

    const emailSubject = `[${appTitle}] Your 6-Digit Security Verification Code: ${rawOtp}`;
    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #090d16; color: #f8fafc; border-radius: 16px; border: 1px solid #1e293b;">
        <div style="margin-bottom: 24px;">
          <h2 style="color: #818cf8; margin: 0 0 8px; font-size: 22px; font-weight: 700;">${appTitle} Zero-Trust Security</h2>
          <p style="color: #94a3b8; font-size: 14px; margin: 0;">Enterprise Identity &amp; Access Control Verification</p>
        </div>
        <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 24px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 12px; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Your Verification Code</p>
          <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; font-family: monospace;">${rawOtp}</div>
          <p style="margin: 12px 0 0; font-size: 12px; color: #64748b;">Expires in <strong>10 minutes</strong> &bull; Single-use only &bull; Max 3 attempts</p>
        </div>
        <p style="font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 16px 0;">
          This code was requested for <strong>${purpose.replace("_", " ").toUpperCase()}</strong>. If you did not initiate this request, please contact your platform administrator immediately.
        </p>
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #1e293b; font-size: 11px; color: #64748b; text-align: center;">
          &copy; ${new Date().getFullYear()} ${appTitle} Autonomous Orchestration Engine. All rights reserved.
        </div>
      </div>
    `;

    const sendRes = await sendEmail({
      to: cleanEmail,
      subject: emailSubject,
      html: emailHtml,
      purpose: `${purpose}_otp`,
      metadata: { tokenId: id },
    });
    emailDispatched = sendRes.success;
  } catch (emailErr) {
    console.error("[OTP Email Dispatch Exception]", emailErr);
  }

  console.log(
    `[ZERO-TRUST OTP DISPATCH] Email: ${cleanEmail} | Purpose: ${purpose} | Dispatched: ${emailDispatched} | 6-Digit OTP: ${rawOtp}`
  );

  return {
    sent: true,
    expiresInMinutes: 10,
    ...(process.env.NODE_ENV !== "production" ? { devOtpPreview: rawOtp } : {}),
  };
}

/**
 * Verifies a 6-digit OTP against `verification_token`.
 * Enforces a strict 10-minute expiration and maximum 3 attempts before token destruction.
 */
export async function verifyEmailOtp(
  email: string,
  otpCode: string,
  purpose: "onboarding" | "password_reset" | "mfa" = "onboarding"
): Promise<{ valid: boolean; error?: string }> {
  await ensureAdminProvisioned();
  const cleanEmail = email.trim().toLowerCase();
  const cleanOtp = otpCode.trim();

  if (!/^\d{6}$/.test(cleanOtp)) {
    return { valid: false, error: "Verification code must be a 6-digit numeric OTP." };
  }

  const res = await pool.query(
    `SELECT "id", "token", "expiresAt", "attempts"
     FROM "verification_token"
     WHERE LOWER("identifier") = $1 AND "purpose" = $2
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [cleanEmail, purpose]
  );

  if (res.rows.length === 0) {
    return { valid: false, error: "No active verification code found. Please request a new OTP." };
  }

  const record = res.rows[0];
  const now = new Date();
  const expiresAt = new Date(record.expiresAt);

  if (now > expiresAt) {
    await pool.query('DELETE FROM "verification_token" WHERE "id" = $1', [record.id]);
    return { valid: false, error: "Verification code has expired (10-minute limit). Please request a new OTP." };
  }

  if (record.attempts >= 3) {
    await pool.query('DELETE FROM "verification_token" WHERE "id" = $1', [record.id]);
    return { valid: false, error: "Maximum verification attempts (3) exceeded. Token invalidated." };
  }

  const candidateHash = hashOtp(cleanOtp);
  if (candidateHash !== record.token) {
    const nextAttempts = Number(record.attempts) + 1;
    if (nextAttempts >= 3) {
      await pool.query('DELETE FROM "verification_token" WHERE "id" = $1', [record.id]);
      return {
        valid: false,
        error: "Invalid verification code. Maximum attempts (3) reached; code has been invalidated.",
      };
    } else {
      await pool.query(
        'UPDATE "verification_token" SET "attempts" = $1 WHERE "id" = $2',
        [nextAttempts, record.id]
      );
      return {
        valid: false,
        error: `Invalid verification code. ${3 - nextAttempts} attempt(s) remaining.`,
      };
    }
  }

  // Valid OTP — consume and delete token immediately to prevent replay
  await pool.query('DELETE FROM "verification_token" WHERE "id" = $1', [record.id]);
  return { valid: true };
}
