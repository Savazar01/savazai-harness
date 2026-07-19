"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Paperclip, X, ChevronDown, Square } from "lucide-react";
import { ChatMessage, type ChatMessageData } from "./chat-message";
import { SystemTrace, type TraceEvent } from "./system-trace";
import { streamFromBackend } from "@/lib/stream-client";
import type { SystemConfig } from "@/components/theme-provider";
import { fetchProviderModels, updateSystemConfig } from "@/app/admin/settings/actions";

const MODEL_PRESETS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1", "o1-mini"],
  anthropic: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.0-pro"],
  openrouter: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemini-1.5-pro", "meta-llama/llama-3-70b"],
  ollama: ["llama3", "mistral", "qwen2.5", "codellama", "mixtral"],
  lmstudio: ["qwen2.5-7b", "qwen2.5-14b", "llama-3.2-3b", "mistral-nemo"],
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
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

export function ChatWorkspace({ initialConfig }: ChatWorkspaceProps) {
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
  const [traceOpen, setTraceOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState(defaultProvider);
  const [activeModel, setActiveModel] = useState(defaultModel);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [activeTools, setActiveTools] = useState<Set<string>>(new Set());
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [capabilityProfile, setCapabilityProfile] = useState(
    (initialConfig.designTokens as Record<string, unknown>)?.capabilityProfile as string || "standard_balanced"
  );
  const abortRef = useRef<AbortController | null>(null);
  const threadRegisteredRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dynamicModels, setDynamicModels] = useState<Record<string, string[]>>({});

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
        if (!res.ok) throw new Error(`Failed to load thread: ${res.status}`);
        const data = await res.json();
        setMessages(data.messages || []);
        setThreadId(detail.threadId);
        threadRegisteredRef.current = true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load thread");
        setMessages([]);
      }

      window.dispatchEvent(new CustomEvent("savazai-thread-activated", {
        detail: { threadId: detail.threadId }
      }));
    };
    window.addEventListener("savazai-select-thread", handler);
    return () => window.removeEventListener("savazai-select-thread", handler);
  }, []);

  const addTrace = useCallback(
    (type: TraceEvent["type"], label: string, detail?: string, payload?: { input?: string; llmDecision?: string; response?: string }) => {
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

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);

    const userMsg: ChatMessageData = {
      id: nextId(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const assistantMsg: ChatMessageData = {
      id: nextId(),
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setStreaming(true);

    if (!threadRegisteredRef.current) {
      const threadTitle = text.length > 60 ? text.slice(0, 57) + "..." : text;
      window.dispatchEvent(new CustomEvent("savazai-thread-created", { detail: { threadId, title: threadTitle, createdAt: new Date().toISOString() } }));
      threadRegisteredRef.current = true;
    }

    addTrace("node", "Supervisor Node", "Routing message through agent graph");
    addTrace("masking", "PII Gateway Active", "Scanning input for sensitive data");

    abortRef.current = new AbortController();

    const filesToSend = attachedFiles.length > 0 ? attachedFiles : undefined;

    try {
      await streamFromBackend(
        text,
        "WedPlanAI-Local",
        (event) => {
          if (event.node) {
            const piiFields = (event.state?.piiCategories as Array<{ type: string; count: number; label: string }>) ?? [];
            addTrace("node", `${event.node} Node`, "Node execution started", {
              input: event.state ? JSON.stringify(event.state, null, 2).slice(0, 800) : undefined,
              llmDecision: event.state?.routingDecision ? JSON.stringify(event.state.routingDecision) : undefined,
              response: event.state?.messages ? JSON.stringify(event.state.messages.slice(-1)[0], null, 2).slice(0, 600) : undefined,
              piiFields: piiFields.length > 0 ? piiFields : undefined,
            });
          }
          if (event.type === "tool" || event.metadata?.tool) {
            const toolName = event.metadata?.toolName ?? event.metadata?.tool ?? "unknown";
            const toolArgs = event.metadata?.args ? JSON.stringify(event.metadata.args) : undefined;
            addTrace("tool", `MCP Tool: ${toolName}`, toolArgs ?? "Tool dispatched", {
              input: event.metadata?.args ? JSON.stringify(event.metadata.args, null, 2).slice(0, 600) : undefined,
              response: event.metadata?.result ? JSON.stringify(event.metadata.result, null, 2).slice(0, 600) : undefined,
            });
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
          if (event.content) {
            addTrace("completion", "LLM Chunk", `${event.content.length} chars received`);
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = { ...last, content: last.content + event.content };
              }
              return updated;
            });
          }
        },
        abortRef.current.signal,
        activeProvider,
        activeModel,
        filesToSend,
        activeTools.size > 0 ? Array.from(activeTools) : undefined,
        threadId,
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
    }
  }, [input, streaming, addTrace, activeProvider, activeModel, attachedFiles, activeTools, threadId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-900 bg-slate-950/40">
          <div>
            <h2 className="text-lg font-bold text-white">Agent Workspace</h2>
            <p className="text-xs text-slate-400">Multi-agent chat with LangGraph orchestration</p>
          </div>
          <div className="hidden lg:block" />
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
              className="w-full bg-transparent border-0 outline-none resize-none text-sm text-white placeholder-slate-500 disabled:opacity-50 py-0.5"
              style={{ minHeight: "24px", maxHeight: "160px" }}
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

                {initialConfig.designTokens?.mcpServers && (
                  <div className="flex items-center gap-1.5 ml-1">
                    {(() => {
                      let serverNames: string[] = [];
                      try {
                        const parsed = JSON.parse(initialConfig.designTokens.mcpServers);
                        const serversObj = parsed.mcpServers || parsed;
                        serverNames = Object.keys(serversObj);
                      } catch {
                        serverNames = ["wedplanai", "playwright"];
                      }
                      return serverNames.map((name) => (
                        <button
                          key={name}
                          onClick={() => toggleTool(name)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition-all ${
                            activeTools.has(name)
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : "bg-slate-800/40 border-slate-700/40 text-slate-400 hover:text-slate-300"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${activeTools.has(name) ? "bg-emerald-400" : "bg-slate-600"}`} />
                          {name}
                        </button>
                      ));
                    })()}
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

      <SystemTrace events={traceEvents} isOpen={traceOpen} onToggle={() => setTraceOpen(!traceOpen)} />
    </div>
  );
}
