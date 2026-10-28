import { NextRequest } from "next/server";
import { ensureAdminProvisioned } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/rbac";
import { syncFlowAgentsToCatalog } from "@/lib/agents/agent-sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requirePermission("capability_studio", ["create_flow", "edit_flow"]);
    if (!authCheck.authorized) {
      const bizCheck = await requirePermission("business_center", "skills_edit");
      if (!bizCheck.authorized) return authCheck.response;
    }

    await ensureAdminProvisioned();

    const result = await syncFlowAgentsToCatalog();

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api/studio/agents/sync POST] Error:", err);
    return new Response(JSON.stringify({ error: errMsg || "Failed to sync agents." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
