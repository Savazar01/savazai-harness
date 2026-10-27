import { NextRequest } from "next/server";
import crypto, { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { pool, ensureAdminProvisioned } from "@/lib/auth";
import { verifyCaptchaToken } from "@/lib/auth/captcha";
import { verifyEmailOtp } from "@/lib/auth/otp";
import { getClientIp } from "@/lib/auth/ip";

function hashToken(tok: string): string {
  return crypto.createHash("sha256").update(tok.trim()).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    await ensureAdminProvisioned();
    const body = await req.json();
    const { name, email, password, otpCode, captchaToken, inviteToken } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return Response.json({ error: "Full name is required." }, { status: 400 });
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return Response.json({ error: "Valid email address is required." }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return Response.json(
        { error: "Initial password must be at least 8 characters long." },
        { status: 400 }
      );
    }
    if (!otpCode || typeof otpCode !== "string") {
      return Response.json(
        { error: "6-digit Email OTP verification code is required." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // 1. Mandatory Administrator Invitation Verification
    if (!inviteToken || typeof inviteToken !== "string" || !inviteToken.trim()) {
      return Response.json(
        { error: "Access Denied: A valid administrator invitation token is required." },
        { status: 403 }
      );
    }

    const hashedToken = hashToken(inviteToken);
    const inviteRes = await pool.query(
      `SELECT "id", "expiresAt" FROM "verification_token"
       WHERE LOWER("identifier") = $1 AND "purpose" = 'invitation' AND "token" = $2
       ORDER BY "createdAt" DESC LIMIT 1`,
      [cleanEmail, hashedToken]
    );

    if (inviteRes.rows.length === 0) {
      return Response.json(
        { error: "Access Denied: Invalid administrator invitation token or email mismatch." },
        { status: 403 }
      );
    }

    const inviteRecord = inviteRes.rows[0];
    if (new Date(inviteRecord.expiresAt) < new Date()) {
      return Response.json(
        { error: "Access Denied: This administrator invitation token has expired." },
        { status: 403 }
      );
    }

    // 2. Verify CAPTCHA token with unforgeable client IP
    const clientIp = getClientIp(req);
    const captchaCheck = await verifyCaptchaToken(captchaToken, clientIp);
    if (!captchaCheck.valid) {
      return Response.json(
        { error: captchaCheck.reason || "CAPTCHA verification failed." },
        { status: 400 }
      );
    }

    // 3. Verify 6-digit OTP code (10-minute TTL, max 3 attempts)
    const otpCheck = await verifyEmailOtp(cleanEmail, otpCode, "onboarding");
    if (!otpCheck.valid) {
      return Response.json({ error: otpCheck.error || "Invalid OTP code." }, { status: 400 });
    }

    // 4. Ensure email is not already registered
    const existing = await pool.query(
      'SELECT "id" FROM "user" WHERE LOWER("email") = $1 LIMIT 1',
      [cleanEmail]
    );
    if (existing.rows.length > 0) {
      return Response.json(
        { error: `An account or pending request with email '${cleanEmail}' already exists.` },
        { status: 409 }
      );
    }

    const userId = randomUUID();
    const accountId = randomUUID();
    const hashedPassword = await hashPassword(password);

    // 5. Create user in strict Zero-Access Quarantine (PENDING_APPROVAL, mustResetPassword = true, roleId = null)
    const userRes = await pool.query(
      `INSERT INTO "user" ("id", "name", "email", "emailVerified", "role", "status", "mustResetPassword", "roleId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, 'user', 'PENDING_APPROVAL', true, NULL, now(), now())
       RETURNING "id", "name", "email", "status", "mustResetPassword", "roleId", "createdAt"`,
      [userId, cleanName, cleanEmail]
    );

    await pool.query(
      `INSERT INTO "account" ("id", "userId", "accountId", "providerId", "issuer", "password", "createdAt", "updatedAt")
       VALUES ($1, $2, $2, 'credential', 'local:credential', $3, now(), now())`,
      [accountId, userId, hashedPassword]
    );

    // 6. Consume/delete the invitation token so it cannot be reused
    await pool.query(
      'DELETE FROM "verification_token" WHERE "id" = $1',
      [inviteRecord.id]
    );

    return Response.json(
      {
        success: true,
        message:
          "Email verified and account placed in quarantine (PENDING_APPROVAL). An administrator must approve your account and provision roles before you can sign in.",
        user: userRes.rows[0],
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to submit access request.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
