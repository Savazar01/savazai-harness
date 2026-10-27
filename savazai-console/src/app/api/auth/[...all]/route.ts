import { auth, pool, ensureAdminProvisioned } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";

const handler = toNextJsHandler(auth);

function isBlockedRegistrationPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return (
    lower.includes("/sign-up") ||
    lower.includes("/signup") ||
    lower.includes("/register")
  );
}

export async function GET(req: NextRequest) {
  if (isBlockedRegistrationPath(req.nextUrl.pathname)) {
    return Response.json(
      { error: "403 Forbidden: Public account registration is permanently disabled." },
      { status: 403 }
    );
  }
  await ensureAdminProvisioned();
  return handler.GET(req);
}

export async function POST(req: NextRequest) {
  await ensureAdminProvisioned();
  const pathname = req.nextUrl.pathname;

  // 1. Permanently block any public registration / sign-up endpoints
  if (isBlockedRegistrationPath(pathname)) {
    console.warn(`[SECURITY BLOCK] Rejected unauthenticated registration attempt on ${pathname}`);
    return Response.json(
      { error: "403 Forbidden: Public account registration is permanently disabled." },
      { status: 403 }
    );
  }

  // 2. Zero-Trust Quarantine & Status Check on Sign-In
  if (pathname.includes("/sign-in/email")) {
    try {
      const cloned = req.clone();
      const body = await cloned.json().catch(() => ({}));
      const rawEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

      if (rawEmail) {
        console.log(
          `[Auth Diagnostic] Sign-in attempt for email: "${rawEmail}" (Configured ADMIN_EMAIL: "${process.env.ADMIN_EMAIL}")`
        );

        const userRes = await pool.query(
          'SELECT "id", "status", "roleId", "role", "mustResetPassword" FROM "user" WHERE LOWER("email") = $1 LIMIT 1',
          [rawEmail]
        );

        if (userRes.rows.length > 0) {
          const u = userRes.rows[0];
          const status = u.status || "PENDING_APPROVAL";

          if (status === "PENDING_APPROVAL") {
            return Response.json(
              {
                code: "ACCOUNT_PENDING_APPROVAL",
                message: "Account pending administrator approval and role provisioning.",
                error: "Account pending administrator approval and role provisioning.",
              },
              { status: 403 }
            );
          }

          if (status === "SUSPENDED" || status === "REJECTED") {
            return Response.json(
              {
                code: "ACCOUNT_SUSPENDED",
                message: `Access denied: Your account status is ${status}.`,
                error: `Access denied: Your account status is ${status}.`,
              },
              { status: 403 }
            );
          }

          // Check that the user has at least 1 assigned role or custom permission
          if (u.role !== "admin" && !u.roleId) {
            const customPermCountRes = await pool.query(
              'SELECT COUNT(*) FROM "user_permission" WHERE "userId" = $1 AND "granted" = true',
              [u.id]
            );
            const customCount = parseInt(customPermCountRes.rows[0]?.count || "0", 10);
            if (customCount === 0) {
              return Response.json(
                {
                  code: "ZERO_PERMISSIONS_ASSIGNED",
                  message: "Account pending administrator approval and role provisioning.",
                  error: "Account pending administrator approval and role provisioning.",
                },
                { status: 403 }
              );
            }
          }
        }
      }
    } catch (err) {
      console.error("[Auth Sign-In Guard] Error checking account status:", err);
    }
  }

  return handler.POST(req);
}
