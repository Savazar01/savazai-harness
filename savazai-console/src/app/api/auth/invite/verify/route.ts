import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { pool, ensureAdminProvisioned } from "@/lib/auth";

function hashToken(tok: string): string {
  return crypto.createHash("sha256").update(tok.trim()).digest("hex");
}

export async function POST(req: Request) {
  await ensureAdminProvisioned();

  try {
    const body = await req.json();
    const { token, email } = body;

    if (!token || !email || typeof token !== "string" || typeof email !== "string") {
      return NextResponse.json(
        { valid: false, error: "Token and email are required parameters." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const hashed = hashToken(token);

    const res = await pool.query(
      `SELECT "id", "expiresAt", "attempts"
       FROM "verification_token"
       WHERE LOWER("identifier") = $1 AND "purpose" = 'invitation' AND "token" = $2
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      [cleanEmail, hashed]
    );

    if (res.rows.length === 0) {
      return NextResponse.json(
        { valid: false, error: "Access Denied: Invalid invitation token or unrecognized email." },
        { status: 403 }
      );
    }

    const record = res.rows[0];
    if (new Date(record.expiresAt) < new Date()) {
      return NextResponse.json(
        { valid: false, error: "Access Denied: This invitation has expired. Contact an administrator for a new invite." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      valid: true,
      email: cleanEmail,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { valid: false, error: err instanceof Error ? err.message : "Invitation verification failed." },
      { status: 500 }
    );
  }
}
