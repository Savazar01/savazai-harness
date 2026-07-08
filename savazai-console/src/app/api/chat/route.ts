import { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_HARNESS_API_URL || "http://savazai-backend:3055";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { message, currentApp, provider, model, files, activeTools } = body;

  const backendUrl = `${BACKEND_URL}/api/graph/invoke/stream?stream-mode=http`;

  const modelConfig = provider
    ? { providerType: provider, modelName: model ?? "" }
    : model
      ? { providerType: model }
      : undefined;

  const payload: Record<string, unknown> = {
    message,
    currentApp: currentApp ?? "WedPlanAI-Local",
  };
  if (modelConfig) payload.modelConfig = modelConfig;
  if (files && Array.isArray(files) && files.length > 0) payload.files = files;
  if (activeTools && Array.isArray(activeTools) && activeTools.length > 0) {
    payload.activeTools = activeTools;
  }

  const response = await fetch(backendUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => `Backend error: ${response.status}`);
    return new Response(
      JSON.stringify({ error: errorText }),
      { status: response.status, headers: { "Content-Type": "application/json" } },
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return new Response(
      JSON.stringify({ error: "Backend returned no body" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

