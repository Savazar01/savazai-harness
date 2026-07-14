import { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_HARNESS_API_URL || "http://savazai-backend:3055";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await props.params;
  const backendUrl = `${BACKEND_URL}/api/graph/threads/${threadId}`;

  const response = await fetch(backendUrl, {
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => `Backend error: ${response.status}`);
    return new Response(JSON.stringify({ error: errText }), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
