import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requirePermission } from "@/lib/auth/rbac";
import { pool, ensureAdminProvisioned } from "@/lib/auth";
import { sendEmail } from "@/lib/email/transporter";

function hashToken(tok: string): string {
  return crypto.createHash("sha256").update(tok.trim()).digest("hex");
}

export async function POST(req: Request) {
  const permCheck = await requirePermission("user_admin", "approve_users");
  if (!permCheck.authorized) {
    return permCheck.response;
  }

  await ensureAdminProvisioned();

  try {
    const body = await req.json();
    const { email, expiryHours = 48, sendEmailDirectly = false } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid invitee email address is required." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashed = hashToken(rawToken);
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + Number(expiryHours) * 60 * 60 * 1000);

    // Delete existing pending invites for this email
    await pool.query(
      'DELETE FROM "verification_token" WHERE LOWER("identifier") = $1 AND "purpose" = \'invitation\'',
      [cleanEmail]
    );

    await pool.query(
      `INSERT INTO "verification_token" ("id", "identifier", "token", "purpose", "expiresAt", "attempts", "createdAt")
       VALUES ($1, $2, $3, 'invitation', $4, 0, now())`,
      [id, cleanEmail, hashed, expiresAt.toISOString()]
    );

    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.BETTER_AUTH_URL ||
      "http://localhost:3056";

    const inviteUrl = `${origin}/auth/invite/onboard?token=${rawToken}&email=${encodeURIComponent(cleanEmail)}`;

    let emailSent = false;
    let emailError: string | null = null;

    if (sendEmailDirectly) {
      const cfgRes = await pool.query(
        'SELECT app_title as "appTitle" FROM system_configurations LIMIT 1'
      );
      const appTitle = cfgRes.rows[0]?.appTitle || "SavazAI Platform";

      const sendRes = await sendEmail({
        to: cleanEmail,
        subject: `[${appTitle}] You've been invited to join the enterprise workspace`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #090d16; color: #f8fafc; border-radius: 16px; border: 1px solid #1e293b;">
            <div style="margin-bottom: 24px;">
              <h2 style="color: #818cf8; margin: 0 0 8px; font-size: 22px; font-weight: 700;">Workspace Invitation</h2>
              <p style="color: #94a3b8; font-size: 14px; margin: 0;">You have been invited by an administrator to onboard onto ${appTitle}.</p>
            </div>
            <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 24px; margin: 20px 0; text-align: center;">
              <p style="margin: 0 0 16px; font-size: 14px; color: #cbd5e1;">Click below to access your secure, pre-authorized onboarding portal:</p>
              <a href="${inviteUrl}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">Complete Onboarding</a>
              <p style="margin: 16px 0 0; font-size: 12px; color: #64748b;">This secure invitation link expires in <strong>${expiryHours} hours</strong>.</p>
            </div>
            <p style="font-size: 12px; color: #64748b; word-break: break-all;">
              Or copy this URL into your browser:<br />${inviteUrl}
            </p>
          </div>
        `,
        purpose: "admin_invite",
      });

      emailSent = sendRes.success;
      emailError = sendRes.error || null;
    }

    return NextResponse.json({
      success: true,
      inviteUrl,
      email: cleanEmail,
      expiresAt: expiresAt.toISOString(),
      dispatchedEmail: sendEmailDirectly,
      emailSent,
      emailError,
    });
  } catch (err: unknown) {
    console.error("[Invite Generation API Error]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate invitation link." },
      { status: 500 }
    );
  }
}

export async function GET() {
  const permCheck = await requirePermission("user_admin", "approve_users");
  if (!permCheck.authorized) {
    return permCheck.response;
  }

  await ensureAdminProvisioned();

  try {
    const res = await pool.query(
      `SELECT "id", "identifier" as "email", "expiresAt", "createdAt"
       FROM "verification_token"
       WHERE "purpose" = 'invitation' AND "expiresAt" > now()
       ORDER BY "createdAt" DESC
       LIMIT 50`
    );

    return NextResponse.json({ invitations: res.rows });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch active invitations." },
      { status: 500 }
    );
  }
}
