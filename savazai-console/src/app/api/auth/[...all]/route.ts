import { auth, ensureAdminProvisioned } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";

const handler = toNextJsHandler(auth);

export async function GET(req: NextRequest) {
  await ensureAdminProvisioned();
  return handler.GET(req);
}

export async function POST(req: NextRequest) {
  try {
    if (req.nextUrl.pathname.includes("/sign-in/email")) {
      const cloned = req.clone();
      const body = await cloned.json().catch(() => ({}));
      if (body?.email) {
        console.log(`[Auth Diagnostic] Sign-in attempt for email: "${body.email}" (Configured ADMIN_EMAIL: "${process.env.ADMIN_EMAIL}")`);
      }
    }
  } catch (_) {}

  await ensureAdminProvisioned();
  return handler.POST(req);
}
