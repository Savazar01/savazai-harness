"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Paperclip, X, ChevronDown, Square, Zap, Server, Check, Layers } from "lucide-react";
import { ChatMessage, type ChatMessageData } from "./chat-message";
import { SystemTrace, type TraceEvent } from "./system-trace";
import { streamFromBackend } from "@/lib/stream-client";
import type { SystemConfig } from "@/components/theme-provider";
import { fetchProviderModels, updateSystemConfig } from "@/app/admin/settings/actions";
import { usePermissions } from "@/lib/auth/use-permissions";

const MODEL_PRESETS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1", "o1-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-3.1-flash-lite", "gemini-3.7-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
  xai: ["grok-2", "grok-2-vision", "grok-beta"],
  omniroute: ["omniroute-default", "meta-llama-3-8b", "gpt-4o-mini"],
  openrouter: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemini-2.5-pro", "meta-llama/llama-3-70b"],
  ollama: ["llama3", "mistral", "qwen2.5", "codellama", "mixtral"],
  lmstudio: ["qwen2.5-7b", "qwen2.5-14b", "llama-3.2-3b", "mistral-nemo"],
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  groq: "Groq",
  xai: "xAI (Grok)",
  omniroute: "OmniRoute AI Gateway",
  openrouter: "OpenRouter",
  ollama: "Ollama",
  lmstudio: "LM Studio",
};

const CAPABILITY_PROFILES: Record<string, { label: string; temp: number; maxTokens: number }> = {
  "fast_creative": { label: "Creative", temp: 0.8, maxTokens: 2048 },
  "standard_balanced": { label: "Balanced", temp: 0.5, maxTokens: 4096 },
  "strict_deterministic": { label: "Exact", temp: 0.0, maxTokens: 2048 },
  "deep_reasoning": { label: "Deep", temp: 0.2, maxTokens: 8192 },
};

interface ChatWorkspaceProps {
  initialConfig: SystemConfig;
}

interface AttachedFile {
  name: string;
  size: number;
  data: string;
  mime: string;
}

let messageIdCounter = 0;
function nextId(): string {
  messageIdCounter += 1;
  return `msg_${messageIdCounter}_${Date.now()}`;
}

function traceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface PlanItem {
  nodeId: string;
  targetNode?: string;
  actionVerb?: string;
  allowedVerbs?: string[];
  targetEntity?: string;
  parameters?: Record<string, unknown>;
  warning?: string;
}

export function ChatWorkspace({ initialConfig }: ChatWorkspaceProps) {
  const { hasPermission } = usePermissions();
  const canRunPublishedFlow = hasPermission("agent_workspace", "run_published_flow");
  const canDirectMcpChat = hasPermission("agent_workspace", "direct_mcp_chat");
  const canHitlApprove = hasPermission("agent_workspace", "hitl_approve");

  const storedProviders = useMemo(
    () => initialConfig.designTokens?.llmProviders ?? ({} as Record<string, { active?: boolean; defaultModel?: string; endpoint?: string; apiKey?: string }>),
    [initialConfig.designTokens?.llmProviders],
  );

  const enabledProviders = useMemo(() => {
    return Object.entries(storedProviders)
      .filter(([, p]) => p.active)
      .map(([key]) => key);
  }, [storedProviders]);

  const defaultProvider = enabledProviders[0] || "openai";
  const defaultModel = storedProviders[defaultProvider]?.defaultModel || MODEL_PRESETS[defaultProvider]?.[0] || "";

  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [threadId, setThreadId] = useState(() => `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [traceOpen, setTraceOpen] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("system_trace_open");
      if (saved !== null) return saved === "true";
    }
    return true;
  });
  const [error, setError] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState(defaultProvider);
  const [activeModel, setActiveModel] = useState(defaultModel);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [activeTools, setActiveTools] = useState<Set<string>>(new Set());
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [executionModeOverride, setExecutionModeOverride] = useState<"inherit" | "plan_first" | "direct">("inherit");
  const [executionModeDropdownOpen, setExecutionModeDropdownOpen] = useState(false);
  const [pendingInterrupt, setPendingInterrupt] = useState<{
    node: string;
    plan: PlanItem[];
    status: string;
    planSummary?: string | null;
    clarificationPrompt?: string | null;
  } | null>(null);
  const [feedbackInput, setFeedbackInput] = useState("");
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [capabilityProfile, setCapabilityProfile] = useState(
    (initialConfig.designTokens as Record<string, unknown>)?.capabilityProfile as string || "standard_balanced"
  );
  const abortRef = useRef<AbortController | null>(null);
  const threadRegisteredRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mcpDropdownRef = useRef<HTMLDivElement>(null);
  const streamCharsRef = useRef(0);
  const [dynamicModels, setDynamicModels] = useState<Record<string, string[]>>({});

  // Dynamic Workspace Target: Published Agentflows vs Direct MCP
  const [executionTarget, setExecutionTarget] = useState<"agentflow" | "mcp">("agentflow");
  const [publishedFlows, setPublishedFlows] = useState<Array<{ id: string; name: string; description?: string; status?: string }>>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string>("");
  const [flowDropdownOpen, setFlowDropdownOpen] = useState(false);

  const [discoveredServers, setDiscoveredServers] = useState<Array<{ serverId: string; tools: Array<{ name: string; description?: string }>; workspaceEnabled?: boolean }>>([]);
  const [mcpDropdownOpen, setMcpDropdownOpen] = useState(false);

  useEffect(() => {
    const prov = storedProviders[activeProvider];
    if (prov && prov.endpoint && prov.apiKey) {
      fetchProviderModels(activeProvider, prov.endpoint, prov.apiKey).then((res) => {
        if (res.success && res.models) {
          setDynamicModels((prev) => ({ ...prev, [activeProvider]: res.models }));
        }
      });
    }
  }, [activeProvider, storedProviders]);

  // Dynamically discover published agentflows and MCP servers from DB / Command Center
  useEffect(() => {
    if (!canRunPublishedFlow && canDirectMcpChat) {
      setExecutionTarget("mcp");
    }

    // 1. Fetch published Agentflows
    if (canRunPublishedFlow) {
      fetch("/api/agentflows")
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (Array.isArray(data)) {
            const published = data.filter((f) => f.status === "published");
            setPublishedFlows(published);
            if (published.length > 0) {
              setSelectedFlowId(published[0].id);
              setExecutionTarget("agentflow");
            } else if (canDirectMcpChat) {
              setExecutionTarget("mcp");
            }
          }
        })
        .catch((err) => console.warn("[ChatWorkspace] Failed to fetch agentflows:", err));
    } else {
      setPublishedFlows([]);
    }

    // 2. Fetch all registered MCP servers and their granular tools
    if (canDirectMcpChat) {
      fetch("/api/mcp")
        .then((res) => (res.ok ? res.json() : { servers: [] }))
        .then((data) => {
          if (data && Array.isArray(data.servers)) {
            // Only expose servers configured as workspace-enabled (internal/studio-only servers are excluded)
            const workspaceServers = data.servers.filter(
              (s: { serverId: string; workspaceEnabled?: boolean }) => s.workspaceEnabled !== false
            );
            setDiscoveredServers(workspaceServers);
            // Opt-in selection: Do NOT bulk-activate all servers. Start empty so user explicitly picks their target
            setActiveTools(new Set());
          }
        })
        .catch((err) => console.warn("[ChatWorkspace] Failed to fetch MCP servers:", err));
    } else {
      setDiscoveredServers([]);
    }
  }, [canRunPublishedFlow, canDirectMcpChat]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.threadId) {
        setMessages([]);
        setTraceEvents([]);
        setError(null);
        setInput("");
        setAttachedFiles([]);
        setActiveTools(new Set());
        setThreadId(detail.threadId);
        threadRegisteredRef.current = false;
      }
    };
    window.addEventListener("savazai-new-chat", handler);
    return () => window.removeEventListener("savazai-new-chat", handler);
  }, []);

  // Click-outside and Escape key listener for MCP Dropdown
  useEffect(() => {
    if (!mcpDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (mcpDropdownRef.current && !mcpDropdownRef.current.contains(e.target as Node)) {
        setMcpDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMcpDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mcpDropdownOpen]);

  const handleToggleTrace = useCallback(() => {
    setTraceOpen((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("system_trace_open", String(next));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.threadId) return;

      setTraceEvents([]);
      setError(null);
      setInput("");
      setStreaming(false);
      abortRef.current?.abort();

      try {
        const res = await fetch(`/api/chat/threads/${detail.threadId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
          setThreadId(detail.threadId);
          threadRegisteredRef.current = true;
        } else {
          setMessages([]);
          setThreadId(detail.threadId);
          threadRegisteredRef.current = false;
        }
      } catch {
        setMessages([]);
        setThreadId(detail.threadId);
        threadRegisteredRef.current = false;
      }

      window.dispatchEvent(new CustomEvent("savazai-thread-activated", {
        detail: { threadId: detail.threadId }
      }));
    };
    window.addEventListener("savazai-select-thread", handler);
    return () => window.removeEventListener("savazai-select-thread", handler);
  }, []);

  const addTrace = useCallback(
    (
      type: TraceEvent["type"],
      label: string,
      detail?: string,
      payload?: {
        input?: string;
        llmDecision?: string;
        response?: string;
        piiFields?: Array<{ type: string; count: number; label: string }>;
      },
    ) => {
      setTraceEvents((prev) => [
        ...prev,
        { id: traceId(), type, label, detail, timestamp: new Date().toISOString(), payload },
      ]);
    },
    [],
  );

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const readers: Promise<AttachedFile>[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      readers.push(
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              name: f.name,
              size: f.size,
              data: reader.result as string,
              mime: f.type,
            });
          };
          reader.readAsDataURL(f);
        }),
      );
    }
    Promise.all(readers).then((results) => {
      setAttachedFiles((prev) => [...prev, ...results]);
    });
    e.target.value = "";
  }, []);

  const removeFile = useCallback((idx: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const toggleTool = useCallback((tool: string) => {
    setActiveTools((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  }, []);

  const handleProfileChange = useCallback(async (profile: string) => {
    setCapabilityProfile(profile);
    setProfileDropdownOpen(false);
    await updateSystemConfig({ capabilityProfile: profile });
  }, []);

  const executeStream = useCallback(async (text: string | null, resumePayload?: unknown) => {
    setError(null);
    setStreaming(true);
    setPendingInterrupt(null);

    if (text !== null) {
      const userMsg: ChatMessageData = {
        id: nextId(),
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
    }

    const assistantMsg: ChatMessageData = {
      id: nextId(),
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    if (text !== null && !threadRegisteredRef.current) {
      const threadTitle = text.length > 60 ? text.slice(0, 57) + "..." : text;
      window.dispatchEvent(new CustomEvent("savazai-thread-created", { detail: { threadId, title: threadTitle, createdAt: new Date().toISOString() } }));
      threadRegisteredRef.current = true;
    }

    if (executionTarget === "agentflow") {
      addTrace("node", "Supervisor Node", resumePayload ? "Resuming execution" : "Routing message through agent graph");
      addTrace("masking", "PII Gateway Active", "Scanning input for sensitive data");
    } else {
      const serverNames = activeTools.size > 0 ? Array.from(activeTools).join(", ") : "None";
      addTrace("node", "Direct MCP Mode", `Routing tool queries to active servers: [${serverNames}]`);
      addTrace("masking", "PII Gateway Active", "Scanning input for sensitive data");
    }

    abortRef.current = new AbortController();
    const filesToSend = attachedFiles.length > 0 ? attachedFiles : undefined;

    try {
      await streamFromBackend(
        text,
        "WedPlanAI-Local",
        (event) => {
          if (event.type === "interrupt" && executionTarget === "agentflow") {
            setPendingInterrupt({
              node: event.node ?? "supervisorNode",
              plan: (event.interrupt?.plan as PlanItem[]) || [],
              status: event.interrupt?.status || "WAITING_USER_APPROVAL",
              planSummary: event.interrupt?.planSummary || null,
              clarificationPrompt: event.interrupt?.clarificationPrompt || null,
            });
            addTrace("node", event.node || "Supervisor", "Execution paused awaiting user approval");

            // Auto-populate feedbackInput with template fields and bracketed choices
            if (event.interrupt?.clarificationPrompt) {
              const lines = String(event.interrupt.clarificationPrompt).split("\n");
              const fieldLines = lines
                .filter((l) => l.includes("• ") || l.includes("- ") || /^\d+\./.test(l.trim()))
                .map((l) => {
                  const rawLabel = l.replace(/^[\s•\-0-9.]+\s*/, "").replace(/\*/g, "").trim();
                  const fieldName = rawLabel.split("[")[0].split("(")[0].trim();
                  const choicesMatch = rawLabel.match(/\[Keep [^\]]+:\s*([^\]]+)\]/i);
                  const choices = choicesMatch ? ` [${choicesMatch[1].trim()}]` : "";
                  return fieldName ? `${fieldName}: ${choices}` : null;
                })
                .filter(Boolean);

              if (fieldLines.length > 0) {
                setFeedbackInput(fieldLines.join("\n"));
              }
            }

            // Remove empty assistant placeholder so chat bubble doesn't look blank or frozen
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant" && !last.content) {
                updated.pop();
              }
              return updated;
            });
            return;
          }
          if (event.type === "trace") {
            const contentStr = String(event.content || "Trace event");
            const lower = contentStr.toLowerCase();
            if (contentStr.startsWith("[Supervisor:") || lower.includes("routing") || lower.includes("supervisor") || lower.includes("plan")) {
              addTrace("routing", "Supervisor Planning", contentStr.slice(0, 200));
            } else if (lower.includes("synthesiz") || lower.includes("final response") || lower.includes("executive report")) {
              addTrace("synthesis", "Response Synthesis", contentStr.slice(0, 200));
            } else if (lower.includes("mask") || lower.includes("pii")) {
              addTrace("masking", "PII Data Gateway", contentStr.slice(0, 200));
            } else if (lower.includes("tool") || lower.includes("mcp")) {
              addTrace("tool", "Tool Invocation", contentStr.slice(0, 200));
            } else {
              addTrace("node", "System Trace", contentStr.slice(0, 200));
            }
            return;
          }
          if (event.type === "audit") {
            addTrace("masking", "PII Audit", String(event.metadata?.subtype || event.node || "Compliance audit"));
            return;
          }
          if (event.type === "done") {
            return;
          }
          if (event.node) {
            const piiFields = (event.state?.piiCategories as Array<{ type: string; count: number; label: string }>) ?? [];
            addTrace("node", `${event.node} Node`, "Node execution started", {
              input: event.state ? JSON.stringify(event.state, null, 2).slice(0, 800) : undefined,
              llmDecision: event.state?.routingDecision ? JSON.stringify(event.state.routingDecision) : undefined,
              response: Array.isArray(event.state?.messages) && event.state.messages.length > 0 ? JSON.stringify((event.state.messages as unknown[]).slice(-1)[0], null, 2).slice(0, 600) : undefined,
              piiFields: piiFields.length > 0 ? piiFields : undefined,
            });
          }
          if (event.type === "tool" || event.metadata?.tool) {
            const toolName = event.metadata?.toolName ?? event.metadata?.tool ?? (event as unknown as Record<string, unknown>).tool ?? "unknown";
            const toolArgs = event.metadata?.args ? JSON.stringify(event.metadata.args) : undefined;
            addTrace("tool", `MCP Tool: ${toolName}`, toolArgs ?? "Tool dispatched", {
              input: event.metadata?.args ? JSON.stringify(event.metadata.args, null, 2).slice(0, 600) : undefined,
              response: event.metadata?.result ? JSON.stringify(event.metadata.result, null, 2).slice(0, 600) : undefined,
            });
            if (event.type === "tool") return;
          }
          if (event.state?.piiCategories) {
            const piiFields = event.state.piiCategories as Array<{ type: string; count: number; label: string }>;
            addTrace("masking", "PII Gateway Active", `Scanned and masked ${piiFields.length} field type(s)`, {
              response: JSON.stringify({ piiFields, maskedPreview: (event.state.maskedInput as string)?.slice(0, 200) }, null, 2),
            });
          }
          if (event.state?.messages) {
            const msgs = event.state.messages as Array<{ role: string; content: string }>;
            const lastAssistant = msgs.filter((m) => m.role === "assistant").pop();
            if (lastAssistant?.content) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: lastAssistant.content };
                }
                return updated;
              });
            }
          }
          if (event.type === "tool" || (event.node && event.node.includes("Tool"))) {
            addTrace("tool", event.node || "Tool Call", String(event.content || "Executing MCP operation").slice(0, 200));
            return;
          }
          if (event.content) {
            const rawContent = String(event.content);
            if (
              rawContent.startsWith("[Supervisor:") ||
              rawContent.startsWith("[Worker:") ||
              rawContent.startsWith("[Team:") ||
              rawContent.startsWith("[Graph ")
            ) {
              addTrace("node", "Internal Trace", rawContent.slice(0, 200));
              return;
            }

            // Deduplicate and aggregate repetitive LLM stream chunks into a single dynamic trace entry
            streamCharsRef.current += rawContent.length;
            const totalChars = streamCharsRef.current;
            setTraceEvents((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.type === "completion" && last.label === "LLM Chunk Streaming") {
                const next = [...prev];
                next[next.length - 1] = {
                  ...last,
                  detail: `${totalChars} total characters received`,
                  timestamp: new Date().toISOString(),
                };
                return next;
              }
              return [
                ...prev,
                {
                  id: traceId(),
                  type: "completion",
                  label: "LLM Chunk Streaming",
                  detail: `${totalChars} total characters received`,
                  timestamp: new Date().toISOString(),
                },
              ];
            });

            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = { ...last, content: last.content + rawContent };
              }
              return updated;
            });
          }
        },
        abortRef.current.signal,
        activeProvider,
        activeModel,
        filesToSend,
        executionTarget === "mcp" && activeTools.size > 0 ? Array.from(activeTools) : undefined,
        threadId,
        executionTarget === "agentflow" && selectedFlowId ? selectedFlowId : undefined,
        executionModeOverride,
        resumePayload,
        executionTarget === "mcp" ? "direct-mcp" : "published-flow",
        executionTarget === "mcp" && activeTools.size > 0 ? Array.from(activeTools) : undefined,
      );
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Stream request failed";
      setError(msg);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === "assistant") {
          updated[updated.length - 1] = {
            ...last,
            content: last.content || "Error: Unable to reach agent engine.",
          };
        }
        return updated;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
      setAttachedFiles([]);
      if (streamCharsRef.current > 0) {
        addTrace("synthesis", "Synthesis Complete", `Successfully streamed final response (${streamCharsRef.current} characters)`);
      }
    }
  }, [threadId, activeProvider, activeModel, attachedFiles, activeTools, executionTarget, selectedFlowId, executionModeOverride, addTrace]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    await executeStream(text);
  }, [input, streaming, executeStream]);

  const handleApproveExecute = useCallback(async () => {
    if (streaming) return;
    const currentPlan = pendingInterrupt?.plan || [];
    const systemMsg: ChatMessageData = {
      id: nextId(),
      role: "system",
      content: "✓ Execution plan approved. Resuming autonomous run...",
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, systemMsg]);
    await executeStream(null, { approved: true, plan: currentPlan });
  }, [streaming, pendingInterrupt, executeStream]);

  const handleRejectReplan = useCallback(async () => {
    if (streaming) return;
    const feedback = feedbackInput.trim() || "Plan rejected by user. Please re-evaluate user intent and formulate a new plan.";
    setFeedbackInput("");
    setShowFeedbackForm(false);
    const systemMsg: ChatMessageData = {
      id: nextId(),
      role: "system",
      content: `❌ Execution plan rejected: "${feedback}". Re-evaluating plan with Supervisor...`,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, systemMsg]);
    await executeStream(null, { approved: false, feedback: `REJECT & REPLAN: ${feedback}` });
  }, [streaming, feedbackInput, executeStream]);

  const handleEditReplan = useCallback(async () => {
    if (streaming) return;
    const feedback = feedbackInput.trim();
    if (!feedback) return;
    setFeedbackInput("");
    setShowFeedbackForm(false);
    const systemMsg: ChatMessageData = {
      id: nextId(),
      role: "system",
      content: `📝 Plan adjustment requested: "${feedback}". Formulating updated plan with Supervisor...`,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, systemMsg]);
    await executeStream(null, { approved: false, feedback: `REPLAN CLARIFICATION: ${feedback}` });
  }, [streaming, feedbackInput, executeStream]);

  const handleSendFeedback = useCallback(async () => {
    const feedback = feedbackInput.trim();
    if (!feedback || streaming) return;
    const currentPlan = pendingInterrupt?.plan || [];
    setFeedbackInput("");
    setShowFeedbackForm(false);
    const systemMsg: ChatMessageData = {
      id: nextId(),
      role: "system",
      content: `✓ Parameter details provided: "${feedback}". Executing plan...`,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, systemMsg]);
    await executeStream(feedback, { approved: true, plan: currentPlan, feedback });
  }, [feedbackInput, streaming, pendingInterrupt, executeStream]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 border-b border-slate-900 bg-slate-950/60 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Agent Workspace
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {executionTarget === "agentflow" ? "Workflow Graph" : "Direct MCP"}
                </span>
              </h2>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex items-center p-0.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
              {canRunPublishedFlow && (
                <button
                  onClick={() => setExecutionTarget("agentflow")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all ${
                    executionTarget === "agentflow"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="Execute compiled multi-agent workflows"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>Published Agentflows</span>
                  {publishedFlows.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-900/60 text-indigo-300 ml-0.5">
                      {publishedFlows.length}
                    </span>
                  )}
                </button>
              )}
              {canDirectMcpChat && (
                <button
                  onClick={() => setExecutionTarget("mcp")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all ${
                    executionTarget === "mcp"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="Execute direct queries with active MCP servers"
                >
                  <Server className="h-3.5 w-3.5" />
                  <span>Direct MCP Chat</span>
                  {discoveredServers.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-900/60 text-indigo-300 ml-0.5">
                      {discoveredServers.length}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Target Specific Selector Dropdown */}
          <div className="flex items-center gap-2">
            {executionTarget === "agentflow" ? (
              <div className="relative">
                <button
                  onClick={() => setFlowDropdownOpen(!flowDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 text-xs font-medium text-slate-200 hover:text-white transition-all shadow-sm"
                >
                  <Layers className="h-3.5 w-3.5 text-indigo-400" />
                  <span className="max-w-[200px] truncate">
                    {publishedFlows.find((f) => f.id === selectedFlowId)?.name || (publishedFlows.length > 0 ? "Select Agentflow" : "No Published Flows")}
                  </span>
                  <ChevronDown className="h-3 w-3 text-slate-500 ml-1" />
                </button>
                {flowDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setFlowDropdownOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 z-30 w-72 rounded-2xl border border-slate-800 bg-[#14141f] shadow-2xl shadow-black/80 py-2 divide-y divide-slate-800/60">
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Published Agentflows ({publishedFlows.length})
                      </div>
                      <div className="py-1 max-h-60 overflow-y-auto">
                        {publishedFlows.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-slate-500 italic">
                            No published flows found. Publish a flow in Capability Studio.
                          </div>
                        ) : (
                          publishedFlows.map((flow) => (
                            <button
                              key={flow.id}
                              onClick={() => {
                                setSelectedFlowId(flow.id);
                                setFlowDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-xs flex flex-col gap-0.5 hover:bg-slate-800/50 transition-colors ${
                                flow.id === selectedFlowId ? "bg-indigo-600/15 text-indigo-300" : "text-slate-300"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-white">{flow.name}</span>
                                {flow.id === selectedFlowId && <Check className="h-3.5 w-3.5 text-indigo-400" />}
                              </div>
                              {flow.description && (
                                <span className="text-[11px] text-slate-400 line-clamp-1">{flow.description}</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="relative" ref={mcpDropdownRef}>
                <button
                  onClick={() => setMcpDropdownOpen(!mcpDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 text-xs font-medium text-slate-200 hover:text-white transition-all shadow-sm"
                >
                  <Server className="h-3.5 w-3.5 text-emerald-400" />
                  <span>
                    {activeTools.size === 0
                      ? `Select MCP Server (${discoveredServers.length} available)`
                      : activeTools.size === 1
                        ? `MCP: ${Array.from(activeTools)[0]} (${discoveredServers.find(s => s.serverId === Array.from(activeTools)[0])?.tools.length ?? 0} tools)`
                        : `MCP: ${activeTools.size} Active (${Array.from(activeTools).join(", ")})`}
                  </span>
                  <ChevronDown className="h-3 w-3 text-slate-500 ml-1" />
                </button>
                {mcpDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 z-30 w-84 rounded-2xl border border-slate-800 bg-[#14141f] shadow-2xl shadow-black/80 py-2 divide-y divide-slate-800/60 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span>Configured MCP Servers ({discoveredServers.length})</span>
                      <span className="text-emerald-400 font-medium lowercase">live discovery</span>
                    </div>
                    <div className="py-1 max-h-72 overflow-y-auto">
                      {discoveredServers.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-500 italic">
                          No MCP servers configured or reachable. Check Command Center settings.
                        </div>
                      ) : (
                        discoveredServers.map((server) => {
                          const isSelected = activeTools.has(server.serverId);
                          return (
                            <button
                              key={server.serverId}
                              type="button"
                              onClick={() => toggleTool(server.serverId)}
                              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-800/50 transition-colors ${
                                isSelected ? "bg-emerald-500/10 text-emerald-300" : "text-slate-400"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  readOnly
                                  className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 cursor-pointer pointer-events-none"
                                />
                                <div>
                                  <div className="font-semibold text-white">{server.serverId}</div>
                                  <div className="text-[10px] text-slate-500">
                                    {server.tools.length} granular tool{server.tools.length !== 1 ? "s" : ""} registered
                                  </div>
                                </div>
                              </div>
                              <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                isSelected ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-slate-800 text-slate-500 border-slate-700"
                              }`}>
                                {isSelected ? "Active" : "Disabled"}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="px-3 py-2 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between rounded-b-2xl">
                      <div className="flex items-center gap-2 text-[10px]">
                        <button
                          type="button"
                          onClick={() => {
                            const all = new Set(discoveredServers.map(s => s.serverId));
                            setActiveTools(all);
                          }}
                          className="text-indigo-400 hover:text-indigo-300 font-semibold"
                        >
                          Select All
                        </button>
                        <span className="text-slate-600">|</span>
                        <button
                          type="button"
                          onClick={() => setActiveTools(new Set())}
                          className="text-slate-400 hover:text-slate-200"
                        >
                          Clear
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMcpDropdownOpen(false)}
                        className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold shadow transition-all cursor-pointer"
                      >
                        Apply &amp; Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-4 space-y-4 scroll-smooth"
        >
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="rounded-3xl border border-slate-900 bg-slate-900/10 p-8 max-w-md">
                <h3 className="text-lg font-bold text-white mb-2">Welcome to the Agent Workspace</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Send a message to start a conversation with the SavazAI multi-agent orchestrator.
                  Your request passes through supervisor, agents, and verification nodes.
                </p>
              </div>
            </div>
          )}
          {messages.map((msg, idx) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isStreaming={streaming && idx === messages.length - 1 && msg.role === "assistant"}
            />
          ))}

          {pendingInterrupt && executionTarget === "agentflow" && (
            <div className="rounded-2xl border border-indigo-500/30 bg-[#0b0b14] p-5 shadow-xl max-w-3xl w-full mx-auto my-4 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 shrink-0">
                  <span className="text-base">📋</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Execution Plan Approval Required</h4>
                  <p className="text-[10px] text-slate-400">The supervisor has formulated the following plan. Please review prior to execution.</p>
                </div>
              </div>

              <div className="space-y-3 border border-slate-900 bg-slate-950/40 rounded-xl p-3.5 max-h-72 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800">
                {pendingInterrupt.clarificationPrompt && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-200 leading-relaxed font-sans font-medium mb-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5">
                      <span>⚠️</span> Information Required To Perform Action
                    </div>
                    <div className="whitespace-pre-wrap text-slate-100 text-xs font-mono bg-slate-950/70 p-3 rounded-lg border border-amber-500/20 leading-relaxed">
                      {pendingInterrupt.clarificationPrompt}
                    </div>
                  </div>
                )}
                {pendingInterrupt.planSummary && (
                  <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-200 leading-relaxed font-sans font-medium mb-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1 flex items-center gap-1">
                      <span>💡</span> Implementation Strategy Summary
                    </div>
                    {pendingInterrupt.planSummary}
                  </div>
                )}
                {pendingInterrupt.plan.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-1 border-b border-slate-900 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-200 truncate">
                        Step {idx + 1}: {item.targetNode || item.nodeId}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-bold text-indigo-300 shrink-0 capitalize">
                        {String(item.actionVerb || item.allowedVerbs?.[0] || "Execute").toLowerCase()}
                      </span>
                    </div>
                    {item.targetEntity && (
                      <div className="text-[10px] text-slate-400">
                        Target: <span className="text-slate-300">{item.targetEntity}</span>
                      </div>
                    )}
                    {item.parameters && Object.keys(item.parameters).length > 0 && (
                      <div className="text-[10px] text-slate-400 mt-1">
                        <span className="block text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Parameters:</span>
                        <pre className="text-[9px] text-cyan-400 font-mono bg-slate-950 p-2 rounded overflow-x-auto [&::-webkit-scrollbar]:h-0.5 [&::-webkit-scrollbar-thumb]:bg-slate-800">
                          {JSON.stringify(item.parameters, null, 2)}
                        </pre>
                      </div>
                    )}
                    {item.warning && (
                      <div className="text-[10px] text-amber-400 mt-1.5 bg-amber-500/5 border border-amber-500/15 px-2 py-1 rounded flex items-start gap-1">
                        <span className="shrink-0">⚠️</span>
                        <span>{item.warning}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t border-slate-900/80 pt-4">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span>Provide or adjust execution parameters below:</span>
                  <span className="text-[11px] font-normal text-indigo-400">💡 Edit bracketed choices or type details</span>
                </div>
                <textarea
                  value={feedbackInput}
                  onChange={(e) => setFeedbackInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey && feedbackInput.trim()) {
                      e.preventDefault();
                      handleSendFeedback();
                    }
                  }}
                  placeholder="Type execution parameters or instructions here (e.g. date: 2026-10-09, symbol: INFY)..."
                  className="w-full rounded-xl border-2 border-indigo-500/40 bg-[#06060b] p-4 text-base text-slate-100 placeholder-slate-500 outline-none resize-y focus:border-indigo-500 font-mono leading-relaxed transition-all min-h-[140px] shadow-inner"
                  rows={Math.max(4, (feedbackInput.match(/\n/g) || []).length + 1)}
                />
                {canHitlApprove ? (
                  <div className="flex flex-wrap gap-2 justify-end pt-2">
                    <button
                      onClick={handleRejectReplan}
                      disabled={streaming}
                      className="px-3.5 py-2 rounded-xl bg-rose-900/60 hover:bg-rose-800 border border-rose-500/30 text-rose-200 font-semibold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow"
                    >
                      <span>❌</span> Reject &amp; Re-Plan
                    </button>

                    {feedbackInput.trim() && (
                      <button
                        onClick={handleEditReplan}
                        disabled={streaming}
                        className="px-3.5 py-2 rounded-xl bg-amber-900/60 hover:bg-amber-800 border border-amber-500/30 text-amber-200 font-semibold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow"
                      >
                        <span>📝</span> Adjust &amp; Re-Plan
                      </button>
                    )}

                    <button
                      onClick={handleSendFeedback}
                      disabled={!feedbackInput.trim() || streaming}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow transition-colors"
                    >
                      <span>✨</span> Submit Details &amp; Execute
                    </button>

                    <button
                      onClick={handleApproveExecute}
                      disabled={streaming}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow flex items-center gap-1.5"
                    >
                      <span>✓</span> Approve &amp; Execute Plan
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded-xl p-3">
                    Requires permission <code className="font-mono">agent_workspace:hitl_approve</code> to approve or adjust execution plans.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="px-6 py-2">
            <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-2 text-xs text-red-400">{error}</div>
          </div>
        )}

        <div className="px-4 py-3 border-t border-slate-900 bg-slate-950/20">
          <div className="bg-[#14141f]/90 border border-[#1f1f2e] focus-within:border-indigo-500/50 rounded-2xl p-3 flex flex-col gap-2.5 transition-all max-w-3xl mx-auto shadow-lg shadow-black/20">
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachedFiles.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-800/60 border border-slate-700/50 pl-2.5 pr-1.5 py-1 text-xs text-slate-300"
                  >
                    <span className="truncate max-w-28">{f.name}</span>
                    <button
                      onClick={() => removeFile(i)}
                      className="p-0.5 rounded-full hover:bg-slate-700/80 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              rows={1}
              disabled={streaming}
              className="w-full bg-transparent border-0 outline-none resize-none text-white placeholder-slate-500 disabled:opacity-50 py-1 leading-relaxed"
              style={{
                minHeight: "28px",
                maxHeight: "160px",
                fontSize: "var(--prompt-font-size, 16px)",
                fontFamily: "var(--prompt-font-family, inherit)",
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all"
                  disabled={streaming}
                  title="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  accept="image/*,.pdf,.txt,.csv,.json,.xml,.md"
                />

                {executionTarget === "agentflow" ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-medium ml-1">
                    <Zap className="h-3 w-3 text-indigo-400 shrink-0" />
                    <span className="truncate max-w-[200px]">
                      {publishedFlows.find((f) => f.id === selectedFlowId)?.name || "Workflow Active"}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium ml-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span>
                      {activeTools.size === 0
                        ? "0 MCP Servers Active"
                        : activeTools.size === 1
                          ? `1 MCP Server Active: ${Array.from(activeTools)[0]}`
                          : `${activeTools.size} MCP Servers Active`}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <div className="relative">
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(!profileDropdownOpen);
                      setProviderDropdownOpen(false);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-800/40 border border-slate-700/40 text-[11px] font-medium text-slate-300 hover:text-white transition-all whitespace-nowrap"
                    title={`Capability: ${CAPABILITY_PROFILES[capabilityProfile]?.label || capabilityProfile}`}
                  >
                    {CAPABILITY_PROFILES[capabilityProfile]?.label || capabilityProfile}
                    <ChevronDown className="h-3 w-3 text-slate-500" />
                  </button>
                  {profileDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setProfileDropdownOpen(false)} />
                      <div className="absolute bottom-full mb-1 right-0 z-20 min-w-[160px] rounded-xl border border-slate-700/50 bg-[#1a1a28] shadow-xl shadow-black/30 py-1">
                        {Object.entries(CAPABILITY_PROFILES).map(([key, cfg]) => (
                          <button
                            key={key}
                            onClick={() => handleProfileChange(key)}
                            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                              key === capabilityProfile
                                ? "bg-indigo-500/15 text-indigo-300"
                                : "text-slate-400 hover:bg-slate-800/40 hover:text-white"
                            }`}
                          >
                            {cfg.label}
                            <span className="block text-[10px] text-slate-500">Temp: {cfg.temp} &middot; Max: {cfg.maxTokens}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="relative">
                  <button
                    onClick={() => {
                      setProviderDropdownOpen(!providerDropdownOpen);
                      setProfileDropdownOpen(false);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-800/40 border border-slate-700/40 text-[11px] font-medium text-slate-300 hover:text-white transition-all max-w-[160px]"
                    title={`${PROVIDER_LABELS[activeProvider] || activeProvider} / ${activeModel || "—"}`}
                  >
                    <span className="truncate">{PROVIDER_LABELS[activeProvider] || activeProvider} &gt; {activeModel || "—"}</span>
                    <ChevronDown className="h-3 w-3 text-slate-500 shrink-0" />
                  </button>
                  {providerDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setProviderDropdownOpen(false)} />
                      <div className="absolute bottom-full mb-1 right-0 z-20 min-w-[200px] max-h-64 overflow-y-auto rounded-xl border border-slate-700/50 bg-[#1a1a28] shadow-xl shadow-black/30 py-1">
                        {enabledProviders.map((key) => (
                          <div key={key}>
                            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-900/40">
                              {PROVIDER_LABELS[key] || key}
                            </div>
                            {(dynamicModels[key] || MODEL_PRESETS[key] || []).map((m) => (
                              <button
                                key={m}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setActiveProvider(key);
                                  setActiveModel(m);
                                  setProviderDropdownOpen(false);
                                }}
                                className={`w-full text-left px-3 py-1 text-xs transition-colors ${
                                  key === activeProvider && m === activeModel
                                    ? "bg-indigo-500/15 text-indigo-300"
                                    : "text-slate-400 hover:bg-slate-800/40 hover:text-white"
                                }`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="relative">
                  <button
                    onClick={() => {
                      setExecutionModeDropdownOpen(!executionModeDropdownOpen);
                      setProfileDropdownOpen(false);
                      setProviderDropdownOpen(false);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-800/40 border border-slate-700/40 text-[11px] font-medium text-slate-300 hover:text-white transition-all whitespace-nowrap"
                    title={`Execution: ${
                      executionModeOverride === "inherit" ? "Inherit Default" :
                      executionModeOverride === "plan_first" ? "Plan First" : "Direct Execution"
                    }`}
                  >
                    {executionModeOverride === "inherit" && "⚙️ Inherit Default"}
                    {executionModeOverride === "plan_first" && "📋 Plan First"}
                    {executionModeOverride === "direct" && "⚡ Direct"}
                    <ChevronDown className="h-3 w-3 text-slate-500" />
                  </button>
                  {executionModeDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setExecutionModeDropdownOpen(false)} />
                      <div className="absolute bottom-full mb-1 right-0 z-20 min-w-[180px] rounded-xl border border-slate-700/50 bg-[#1a1a28] shadow-xl shadow-black/30 py-1">
                        <button
                          onClick={() => {
                            setExecutionModeOverride("inherit");
                            setExecutionModeDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                            executionModeOverride === "inherit"
                              ? "bg-indigo-500/15 text-indigo-300"
                              : "text-slate-400 hover:bg-slate-800/40 hover:text-white"
                          }`}
                        >
                          ⚙️ Inherit Agent Default
                        </button>
                        <button
                          onClick={() => {
                            setExecutionModeOverride("plan_first");
                            setExecutionModeDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                            executionModeOverride === "plan_first"
                              ? "bg-indigo-500/15 text-indigo-300"
                              : "text-slate-400 hover:bg-slate-800/40 hover:text-white"
                          }`}
                        >
                          📋 Plan First
                        </button>
                        <button
                          onClick={() => {
                            setExecutionModeOverride("direct");
                            setExecutionModeDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                            executionModeOverride === "direct"
                              ? "bg-indigo-500/15 text-indigo-300"
                              : "text-slate-400 hover:bg-slate-800/40 hover:text-white"
                          }`}
                        >
                          ⚡ Direct Execution
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={handleSend}
                  disabled={!input.trim() || streaming}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
                {streaming && (
                  <button
                    onClick={() => abortRef.current?.abort()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/25 hover:bg-red-500 transition-all"
                    title="Stop Execution"
                  >
                    <Square className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-600 text-center">
            {PROVIDER_LABELS[activeProvider] || activeProvider} / {activeModel || "—"} &middot;
            NDJSON streaming &middot; PII gateway active
          </p>
        </div>
      </div>

      <SystemTrace events={traceEvents} isOpen={traceOpen} onToggle={handleToggleTrace} />
    </div>
  );
}
