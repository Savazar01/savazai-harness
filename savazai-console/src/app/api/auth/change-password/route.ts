import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { auth, pool, ensureAdminProvisioned } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await ensureAdminProvisioned();
    const reqHeaders = await headers();
    const session = await auth.api.getSession({ headers: reqHeaders });

    if (!session?.user?.id) {
      return Response.json(
        { error: "Unauthorized: Active session required." },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await req.json();
    const { currentPassword, newPassword, confirmPassword } = body;

    if (!currentPassword || typeof currentPassword !== "string") {
      return Response.json({ error: "Current password is required." }, { status: 400 });
    }
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return Response.json(
        { error: "New password must be at least 8 characters long." },
        { status: 400 }
      );
    }
    if (newPassword !== confirmPassword) {
      return Response.json(
        { error: "New password and confirmation do not match." },
        { status: 400 }
      );
    }

    // Verify current password against account table
    const accRes = await pool.query(
      'SELECT id, password FROM "account" WHERE "userId" = $1 AND "providerId" = \'credential\' LIMIT 1',
      [userId]
    );

    if (accRes.rows.length === 0 || !accRes.rows[0].password) {
      return Response.json(
        { error: "No local password credential found for this account." },
        { status: 400 }
      );
    }

    const currentHash = accRes.rows[0].password;
    const isCurrentValid = await verifyPassword({
      hash: currentHash,
      password: currentPassword,
    });

    if (!isCurrentValid) {
      return Response.json(
        { error: "Current password entered is incorrect." },
        { status: 400 }
      );
    }

    // Hash new password and update
    const newHash = await hashPassword(newPassword);

    await pool.query(
      'UPDATE "account" SET password = $1, "updatedAt" = now() WHERE id = $2',
      [newHash, accRes.rows[0].id]
    );

    await pool.query(
      'UPDATE "user" SET "mustResetPassword" = false, "updatedAt" = now() WHERE id = $1',
      [userId]
    );

    // Invalidate all active sessions upon password modification for security
    await pool.query('DELETE FROM "session" WHERE "userId" = $1', [userId]);

    return Response.json(
      {
        success: true,
        message: "Your password has been changed successfully.",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("[POST /api/auth/change-password] Error:", err);
    const errorMsg = err instanceof Error ? err.message : "Failed to change password.";
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
