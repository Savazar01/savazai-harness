import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/rbac";
import { getInternalBackendHeaders } from "@/lib/backend-client";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_HARNESS_API_URL || "http://savazai-backend:3055";

export async function POST(req: NextRequest) {
  try {
    const check = await requirePermission("capability_studio", ["publish", "edit_flow"]);
    if (!check.authorized) return check.response;

    const body = await req.json();

    const response = await fetch(`${BACKEND_URL}/api/graph/compile`, {
      method: "POST",
      headers: getInternalBackendHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => `Backend error: ${response.status}`);
      let parsedError: Record<string, unknown> | null = null;
      try {
        parsedError = JSON.parse(errorText);
      } catch {}
      const finalError = (parsedError?.error as string) || errorText;
      return new Response(
        JSON.stringify({ error: finalError, details: parsedError?.details }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: errMsg || "Compiler proxy connection failure." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
