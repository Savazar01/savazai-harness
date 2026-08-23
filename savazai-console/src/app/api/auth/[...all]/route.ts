import { auth, ensureAdminProvisioned } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";

const handler = toNextJsHandler(auth);

export async function GET(req: NextRequest) {
  await ensureAdminProvisioned();
  return handler.GET(req);
}

export async function POST(req: NextRequest) {
  await ensureAdminProvisioned();
  return handler.POST(req);
}
