import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { auth, pool, ensureAdminProvisioned } from "@/lib/auth";
import { resolveUserAccessById, resolveDefaultLandingRoute } from "@/lib/auth/rbac";

export async function POST(req: NextRequest) {
  try {
    await ensureAdminProvisioned();
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return Response.json(
        { error: "Unauthorized: You must be signed in to reset your password." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { newPassword, confirmPassword } = body;

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return Response.json(
        {
          error:
            "Password policy violation: New password must be at least 8 characters long and include uppercase, lowercase, number, and symbol.",
        },
        { status: 400 }
      );
    }

    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasDigit = /\d/.test(newPassword);
    if (!hasUpper || !hasLower || !hasDigit) {
      return Response.json(
        {
          error:
            "Password policy violation: Password must contain at least one uppercase letter, one lowercase letter, and one digit.",
        },
        { status: 400 }
      );
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return Response.json({ error: "Passwords do not match." }, { status: 400 });
    }

    const userId = session.user.id;
    const accessCtx = await resolveUserAccessById(userId);
    if (!accessCtx || accessCtx.status !== "ACTIVE") {
      return Response.json(
        { error: "Account is not active. Cannot reset password." },
        { status: 403 }
      );
    }

    const hashedPassword = await hashPassword(newPassword);

    const accountRes = await pool.query(
      'SELECT "id" FROM "account" WHERE "userId" = $1 AND "providerId" = \'credential\' LIMIT 1',
      [userId]
    );

    if (accountRes.rows.length > 0) {
      await pool.query(
        'UPDATE "account" SET "password" = $1, "issuer" = \'local:credential\', "updatedAt" = now() WHERE "userId" = $2 AND "providerId" = \'credential\'',
        [hashedPassword, userId]
      );
    } else {
      const accountId = randomUUID();
      await pool.query(
        'INSERT INTO "account" ("id", "userId", "accountId", "providerId", "issuer", "password", "createdAt", "updatedAt") VALUES ($1, $2, $2, \'credential\', \'local:credential\', $3, now(), now())',
        [accountId, userId, hashedPassword]
      );
    }

    await pool.query(
      'UPDATE "user" SET "mustResetPassword" = false, "updatedAt" = now() WHERE "id" = $1',
      [userId]
    );

    const updatedCtx = await resolveUserAccessById(userId);
    const redirectTo = updatedCtx
      ? resolveDefaultLandingRoute(updatedCtx.permissions)
      : "/dashboard";

    return Response.json(
      {
        success: true,
        message: "Password updated successfully.",
        redirectTo,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update password.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
