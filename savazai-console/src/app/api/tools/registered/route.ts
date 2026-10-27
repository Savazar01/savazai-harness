import { requirePermission } from "@/lib/auth/rbac";
import { getInternalBackendHeaders } from "@/lib/backend-client";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_HARNESS_API_URL || "http://savazai-backend:3055";

export async function GET() {
  const studioCheck = await requirePermission("capability_studio", "view");
  if (!studioCheck.authorized) {
    const wsCheck = await requirePermission("agent_workspace", "view");
    if (!wsCheck.authorized) {
      return studioCheck.response;
    }
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/tools/registered`, {
      headers: getInternalBackendHeaders(),
    });
    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Backend error: ${response.status}` }),
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
      JSON.stringify({ error: errMsg || "Tools registry proxy connection failure." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
