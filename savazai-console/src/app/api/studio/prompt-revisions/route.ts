import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/rbac";
import { recordPromptRevision } from "@/lib/versioning/asset-versioner";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requirePermission("capability_studio", ["edit_flow", "save_draft"]);
    let authContext = authCheck.context;
    if (!authCheck.authorized) {
      const bizCheck = await requirePermission("business_center", "skills_edit");
      if (!bizCheck.authorized) return authCheck.response;
      authContext = bizCheck.context;
    }

    const body = await req.json();
    const { agentId, agentName, agentRole, agentflowId, agentflowTitle, systemPrompt, changeSummary } = body;

    if (!agentId || !systemPrompt || typeof systemPrompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing required fields: agentId and systemPrompt are required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const revisionId = await recordPromptRevision({
      agentId: String(agentId),
      agentName: agentName ? String(agentName) : undefined,
      agentRole: agentRole ? String(agentRole) : undefined,
      agentflowId: agentflowId ? String(agentflowId) : "standalone",
      agentflowTitle: agentflowTitle ? String(agentflowTitle) : undefined,
      systemPrompt: systemPrompt.trim(),
      changeSummary: changeSummary ? String(changeSummary) : undefined,
      authorId: authContext?.userId || "unknown",
      authorEmail: authContext?.email || "system@savazai.local",
    });

    return new Response(
      JSON.stringify({ success: true, revisionId, isNewVersion: Boolean(revisionId) }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[studio/prompt-revisions] Error:", err);
    return new Response(
      JSON.stringify({ error: errMsg || "Failed to snapshot prompt revision." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
