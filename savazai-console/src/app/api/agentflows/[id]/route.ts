import { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_HARNESS_API_URL || "http://savazai-backend:3055";

export async function GET(
  _req: NextRequest,
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
    const response = await fetch(`${BACKEND_URL}/api/agentflows/${id}`);
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
      headers: { "Content-Type": "application/json" },
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
    const { id } = await params;
    if (!id) {
      return new Response(
        JSON.stringify({ error: "Missing agentflow ID in URL." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const response = await fetch(`${BACKEND_URL}/api/agentflows/${id}`, {
      method: "DELETE",
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
      JSON.stringify({ error: errMsg || "Agentflow delete proxy failure." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
