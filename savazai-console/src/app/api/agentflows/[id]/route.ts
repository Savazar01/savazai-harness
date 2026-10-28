import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/rbac";
import { getInternalBackendHeaders } from "@/lib/backend-client";
import { recordPromptRevision } from "@/lib/versioning/asset-versioner";
import { logAuditEvent } from "@/lib/audit/audit-logger";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_HARNESS_API_URL || "http://savazai-backend:3055";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studioCheck = await requirePermission("capability_studio", "view");
    if (!studioCheck.authorized) {
      const wsCheck = await requirePermission("agent_workspace", ["view", "run_published_flow"]);
      if (!wsCheck.authorized) return studioCheck.response;
    }

    const { id } = await params;
    if (!id) {
      return new Response(
        JSON.stringify({ error: "Missing agentflow ID in URL." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const response = await fetch(`${BACKEND_URL}/api/agentflows/${id}`, {
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
      JSON.stringify({ error: errMsg || "Agentflow fetch proxy failure." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return new Response(
        JSON.stringify({ error: "Missing agentflow ID in URL." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const body = await req.json();

    let authContext: any = null;
    if (body.status === "published") {
      const pubCheck = await requirePermission("capability_studio", "publish");
      if (!pubCheck.authorized) return pubCheck.response;
      authContext = pubCheck.context;
    } else {
      const editCheck = await requirePermission("capability_studio", ["save_draft", "edit_flow"]);
      if (!editCheck.authorized) {
        const bizCheck = await requirePermission("business_center", "skills_edit");
        if (!bizCheck.authorized) return editCheck.response;
        authContext = bizCheck.context;
      } else {
        authContext = editCheck.context;
      }
    }

    const forwarded: Record<string, unknown> = {};
    if (body.canvasDefinition !== undefined) {
      forwarded.canvasDefinition = typeof body.canvasDefinition === "string"
        ? body.canvasDefinition
        : JSON.stringify(body.canvasDefinition);
    }
    if (body.status !== undefined) forwarded.status = body.status;
    if (body.name !== undefined) forwarded.name = body.name;
    if (body.description !== undefined) forwarded.description = body.description;
    forwarded.updatedAt = new Date().toISOString();

    const response = await fetch(`${BACKEND_URL}/api/agentflows/${id}`, {
      method: "PUT",
      headers: getInternalBackendHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(forwarded),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => `Backend error: ${response.status}`);
      return new Response(
        JSON.stringify({ error: errorText }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }
    const data = await response.json();

    // Audit and prompt revision tracking
    if (authContext) {
      try {
        let canvasObj: any = body.canvasDefinition;
        if (typeof canvasObj === "string") {
          try {
            canvasObj = JSON.parse(canvasObj);
          } catch {
            canvasObj = null;
          }
        }
        if (canvasObj && Array.isArray(canvasObj.nodes)) {
          for (const node of canvasObj.nodes) {
            const prompt = node.data?.systemPrompt || node.data?.prompt || node.data?.instructions;
            if (prompt && typeof prompt === "string" && prompt.trim().length > 0) {
              const agentId = node.id || node.data?.id || node.data?.name || "agent_node";
              await recordPromptRevision({
                agentId: String(agentId),
                agentflowId: id,
                systemPrompt: prompt,
                authorId: authContext.userId,
                authorEmail: authContext.email,
              }).catch((e) => console.warn("[recordPromptRevision] Non-fatal error:", e));
            }
          }
        }

        await logAuditEvent({
          category: "AGENTFLOWS",
          action: body.status === "published" ? "AGENTFLOW_PUBLISHED" : "AGENTFLOW_UPDATED",
          resource: "agentflows",
          actorId: authContext.userId,
          actorEmail: authContext.email,
          targetId: id,
          targetName: body.name || `Flow ${id}`,
          details: {
            status: body.status,
            name: body.name,
            nodeCount: Array.isArray(canvasObj?.nodes) ? canvasObj.nodes.length : undefined,
          },
        }).catch((e) => console.warn("[logAuditEvent] Non-fatal error:", e));
      } catch (e) {
        console.warn("[agentflow PUT audit error]:", e);
      }
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: errMsg || "Agentflow update proxy failure." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("capability_studio", "delete_flow");
    if (!check.authorized) return check.response;

    const { id } = await params;
    if (!id) {
      return new Response(
        JSON.stringify({ error: "Missing agentflow ID in URL." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const response = await fetch(`${BACKEND_URL}/api/agentflows/${id}`, {
      method: "DELETE",
      headers: getInternalBackendHeaders(),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => `Backend error: ${response.status}`);
      return new Response(
        JSON.stringify({ error: errorText }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    await logAuditEvent({
      category: "AGENTFLOWS",
      action: "AGENTFLOW_DELETED",
      resource: "agentflows",
      actorId: check.context.userId,
      actorEmail: check.context.email,
      targetId: id,
      targetName: `Agentflow ${id}`,
      details: {
        agentflowId: id,
      },
    }).catch((e) => console.warn("[logAuditEvent] Non-fatal error:", e));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: errMsg || "Agentflow delete proxy failure." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export const PATCH = PUT;
