export interface StreamEvent {
  type: string;
  node?: string;
  state?: Record<string, unknown>;
  content?: string;
  metadata?: Record<string, unknown>;
}

export type StreamCallback = (event: StreamEvent) => void;

export async function streamFromBackend(
  message: string,
  currentApp: string,
  onEvent: StreamCallback,
  signal?: AbortSignal,
  provider?: string,
  model?: string,
  files?: Array<{ name: string; size: number; data: string; mime: string }>,
  activeTools?: string[],
  threadId?: string,
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, currentApp, provider, model, files, activeTools, threadId }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Stream request failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let jsonText = trimmed;
      if (trimmed.startsWith("data: ")) {
        jsonText = trimmed.slice(6);
      }

      if (jsonText === "[DONE]") continue;

      try {
        const parsed = JSON.parse(jsonText);
        let event = parsed;
        const keys = Object.keys(parsed);
        const knownNodes = ["supervisor", "verifier", "respond", "subAgent", "corrector", "mcpAction"];
        const activeNode = keys.find((k) => knownNodes.includes(k));
        if (activeNode) {
          event = {
            type: "update",
            node: activeNode,
            state: parsed[activeNode],
            metadata: parsed[activeNode]?.metadata,
          };
        }
        onEvent(event);
      } catch {
        if (typeof jsonText === "string" && jsonText.length > 0) {
          onEvent({ type: "content", content: jsonText });
        }
      }
    }
  }
}
