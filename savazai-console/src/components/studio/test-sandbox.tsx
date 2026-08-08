"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Send,
  Loader2,
  Bot,
  User,
  AlertCircle,
  Trash2,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Activity,
  ChevronDown
} from "lucide-react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
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

interface ApprovalPayload {
  approved: boolean;
  feedback?: string;
  plan?: PlanItem[];
}

interface TestSandboxProps {
  canvasJson: string;
  onClose: () => void;
  onNodeEvent?: (label: string, event: "running" | "success" | "failed") => void;
}

type WidthMode = "compact" | "expanded" | "fullscreen";

type NodeExecStatus = "idle" | "running" | "success" | "failed";

export function TestSandbox({ canvasJson, onClose, onNodeEvent }: TestSandboxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [widthMode, setWidthMode] = useState<WidthMode>("compact");
  const [nodeStatus, setNodeStatus] = useState<Record<string, NodeExecStatus>>({});
  const [hitlPending, setHitlPending] = useState<Record<string, unknown> | null>(null);
  const [executionModeOverride, setExecutionModeOverride] = useState<"inherit" | "plan_first" | "direct">("plan_first");
  const [executionModeDropdownOpen, setExecutionModeDropdownOpen] = useState(false);
  const [pendingInterrupt, setPendingInterrupt] = useState<{
    node: string;
    plan: PlanItem[];
    planSummary?: string | null;
    clarificationPrompt?: string | null;
    status: string;
  } | null>(null);
  const [feedbackInput, setFeedbackInput] = useState("");
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [threadId] = useState(() => `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Automatic Supervisor Welcome Greeting on Playground Launch
  useEffect(() => {
    if (messages.length === 0) {
      const initWelcome = async () => {
        try {
          const parsedCanvas = JSON.parse(canvasJson);
          const res = await fetch("/api/orchestrator/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "welcome", message: "WELCOME_INIT", nodes: parsedCanvas.nodes, edges: parsedCanvas.edges })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.message) {
              setMessages([{ role: "assistant", content: data.message, timestamp: Date.now() }]);
            }
          }
        } catch { /* ignore */ }
      };
      initWelcome();
    }
  }, [canvasJson, messages.length]);

  const executeStream = async (text: string | null, resumePayload?: unknown) => {
    setError(null);
    setStreaming(true);
    setPendingInterrupt(null);

    if (text !== null) {
      const userMsg: ChatMessage = { role: "user", content: text, timestamp: Date.now() };
      setMessages((prev) => [...prev, userMsg]);
    }

    setMessages((prev) => [...prev, { role: "assistant", content: "", timestamp: Date.now() }]);

    try {
      const lastUserPrompt = [...messages].reverse().find(m => m.role === "user")?.content || null;
      const payloadObj: Record<string, unknown> = {
        message: text !== null ? text : lastUserPrompt,
        executionMode: executionModeOverride,
        threadId,
        ...(() => {
          if (resumePayload !== undefined) {
            const approval = resumePayload as ApprovalPayload;
            if (approval.approved) {
              return { approvedPlan: (approval.plan && approval.plan.length > 0) ? approval.plan : true };
            } else {
              const fullMsg = lastUserPrompt && approval.feedback
                ? `${lastUserPrompt}\n\n[USER FEEDBACK / MODIFICATION]: ${approval.feedback}`
                : (approval.feedback || lastUserPrompt);
              return { approvedPlan: false, message: fullMsg };
            }
          }
          return {};
        })(),
        ...(() => {
          try { return JSON.parse(canvasJson); } catch { return { nodes: [], edges: [] }; }
        })(),
      };

      const res = await fetch("/api/orchestrator/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadObj),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        setMessages((prev) => prev.filter((m) => !(m.role === "assistant" && m.content === "")));
        setError(`Execution error (${res.status}): ${errText}`);
        setStreaming(false);
        return;
      }

      // Check if it's a direct JSON response (paused awaiting human approval)
      const contentType = res.headers.get("Content-Type");
      if (contentType && contentType.includes("application/json")) {
        const json = await res.json();
        if (json.status === "PAUSED_AWAITING_HUMAN_APPROVAL") {
          setPendingInterrupt({
            node: "Supervisor Agent",
            plan: json.executionPlan || [],
            planSummary: json.planSummary || null,
            clarificationPrompt: json.clarificationPrompt || null,
            status: "WAITING_USER_APPROVAL",
          });

          // Auto-populate feedbackInput with template fields and bracketed choices
          if (json.clarificationPrompt) {
            const lines = String(json.clarificationPrompt).split("\n");
            const fieldLines = lines
              .filter(l => l.includes("• ") || l.includes("- ") || /^\d+\./.test(l.trim()))
              .map(l => {
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

          setMessages((prev) => {
            const list = [...prev];
            const last = list[list.length - 1];
            if (last && last.role === "assistant" && last.content === "") {
              list.pop();
            }
            if (json.clarificationPrompt) {
              list.push({ role: "assistant", content: json.clarificationPrompt, timestamp: Date.now() });
            }
            return list;
          });
          setStreaming(false);
          return;
        }
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setMessages((prev) => prev.filter((m) => !(m.role === "assistant" && m.content === "")));
        setError("No response stream available");
        setStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;

          try {
            const parsed = JSON.parse(payload);
            
            if (parsed.type === "trace") {
              const trace = (parsed.content || "") as string;
              // Parse node execution markers from trace events
              const workerExecMatch = trace.match(/\[Worker Exec:\s*([^\]]+)\]/);
              const workerCompleteMatch = trace.match(/\[Worker Complete:\s*([^\]]+)\]/);
              const workerErrorMatch = trace.match(/\[Worker Tool Error:\s*([^\]]+)\]/);
              if (workerExecMatch) {
                const label = workerExecMatch[1].trim();
                setNodeStatus(prev => ({ ...prev, [label]: "running" }));
                onNodeEvent?.(label, "running");
              } else if (workerCompleteMatch) {
                const label = workerCompleteMatch[1].trim();
                setNodeStatus(prev => ({ ...prev, [label]: "success" }));
                onNodeEvent?.(label, "success");
              } else if (workerErrorMatch) {
                const label = workerErrorMatch[1].trim();
                setNodeStatus(prev => ({ ...prev, [label]: "failed" }));
                onNodeEvent?.(label, "failed");
              }
              setMessages((prev) => {
                const list = [...prev];
                const last = list[list.length - 1];
                if (last && last.role === "assistant" && last.content === "") {
                  list.pop();
                }
                list.push({ role: "system", content: trace, timestamp: Date.now() });
                list.push({ role: "assistant", content: "", timestamp: Date.now() });
                return list;
              });
            } else if (parsed.type === "hitl") {
              setHitlPending(parsed);
              setStreaming(false);
            } else if (parsed.type === "done") {
              // Execution complete — stream ending
            } else if (parsed.type === "error") {
              setError(parsed.content || "Stream execution error");
              setStreaming(false);
            } else {
              const chunk = parsed.content || "";
              setMessages((prev) => {
                const updated = [...prev];
                let last = updated[updated.length - 1];
                if (!last || last.role !== "assistant") {
                  updated.push({ role: "assistant", content: "", timestamp: Date.now() });
                  last = updated[updated.length - 1];
                }
                updated[updated.length - 1] = { ...last, content: last.content + chunk };
                return updated;
              });
            }
          } catch {
            // non-JSON payload, skip
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => prev.filter((m) => !(m.role === "assistant" && m.content === "")));
      setError(`Connection error: ${errMsg}`);
    } finally {
      setStreaming(false);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    setInput("");
    await executeStream(trimmed);
  };

  const handleApproveExecute = async () => {
    if (streaming) return;
    const currentPlan = pendingInterrupt?.plan || [];
    setMessages((prev) => [...prev, { role: "system", content: "✓ Execution plan approved. Resuming sandbox run...", timestamp: Date.now() }]);
    await executeStream(null, { approved: true, plan: currentPlan });
  };

  const handleRejectReplan = async () => {
    if (streaming) return;
    const feedback = feedbackInput.trim() || "Plan rejected by user. Please re-evaluate user intent and formulate a new plan.";
    setFeedbackInput("");
    setMessages((prev) => [...prev, { role: "system", content: `❌ Execution plan rejected: "${feedback}". Re-evaluating plan with Supervisor...`, timestamp: Date.now() }]);
    await executeStream(null, { approved: false, feedback: `REJECT & REPLAN: ${feedback}` });
  };

  const handleEditReplan = async () => {
    if (streaming) return;
    const feedback = feedbackInput.trim();
    if (!feedback) return;
    setFeedbackInput("");
    setMessages((prev) => [...prev, { role: "system", content: `📝 Plan adjustment requested: "${feedback}". Formulating updated plan with Supervisor...`, timestamp: Date.now() }]);
    await executeStream(null, { approved: false, feedback: `REPLAN CLARIFICATION: ${feedback}` });
  };

  const handleSendFeedback = async () => {
    const feedback = feedbackInput.trim();
    if (!feedback || streaming) return;
    const currentPlan = pendingInterrupt?.plan || [];
    setFeedbackInput("");
    setShowFeedbackForm(false);
    setMessages((prev) => [...prev, { role: "system", content: `✓ Parameter details provided: "${feedback}". Executing plan...`, timestamp: Date.now() }]);
    await executeStream(feedback, { approved: true, plan: currentPlan, feedback });
  };

  const handleClear = () => {
    setMessages([]);
    setError(null);
  };

  const getWidthClass = () => {
    switch (widthMode) {
      case "fullscreen":
        return "w-[95%] h-[92%] rounded-3xl border border-slate-900 m-auto";
      case "expanded":
        return "w-full max-w-2xl md:max-w-[50%] h-full border-l border-slate-900";
      case "compact":
      default:
        return "w-full max-w-md h-full border-l border-slate-900";
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center ${widthMode === "fullscreen" ? "justify-center" : "justify-end"}`}>
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className={`relative bg-slate-950 shadow-2xl flex flex-col z-10 transition-all duration-300 ${getWidthClass()}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-900 bg-slate-950/40 shrink-0">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-white leading-tight">Test Playground</h4>
              <p className="text-[9px] text-slate-500">Verify generic agent graph execution traces</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Width Toggle Buttons */}
            {widthMode !== "fullscreen" ? (
              <button
                type="button"
                onClick={() => setWidthMode(widthMode === "compact" ? "expanded" : "compact")}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-900 transition-all"
                title={widthMode === "compact" ? "Expand to 50% width" : "Contract drawer"}
              >
                {widthMode === "compact" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setWidthMode(widthMode === "fullscreen" ? "compact" : "fullscreen")}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-900 transition-all"
              title={widthMode === "fullscreen" ? "Dock to side" : "Pop out to full screen"}
            >
              {widthMode === "fullscreen" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-900 transition-all"
                title="Clear conversation"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}

            <button onClick={onClose} className="text-slate-500 hover:text-white p-1.5 hover:bg-slate-900 rounded-lg transition-all">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Node Execution Status */}
        {Object.keys(nodeStatus).length > 0 && (
          <div className="flex items-center gap-2 px-5 py-2 border-b border-slate-900 bg-slate-950/20 shrink-0 overflow-x-auto">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider shrink-0">Nodes:</span>
            {Object.entries(nodeStatus).map(([label, status]) => (
              <span
                key={label}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${
                  status === "running"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    : status === "success"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : status === "failed"
                    ? "bg-red-500/10 text-red-400 border-red-500/30"
                    : "bg-slate-800/50 text-slate-500 border-slate-800"
                }`}
              >
                {status === "running" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                {status === "success" && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                {status === "failed" && <span className="h-2 w-2 rounded-full bg-red-500" />}
                {label}
              </span>
            ))}
          </div>
        )}

        {/* HITL Approval Overlay */}
        {hitlPending && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6 max-w-sm mx-4 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="h-6 w-6 text-amber-400 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-white">Approval Required</h4>
                  <p className="text-[10px] text-slate-400">HITL guardrail triggered</p>
                </div>
              </div>
              <div className="text-xs text-slate-300 mb-4 bg-slate-950 rounded-xl p-3 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                {JSON.stringify(hitlPending, null, 2)}
              </div>
              <button
                onClick={() => setHitlPending(null)}
                className="w-full py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-semibold hover:bg-amber-500/20 transition-all"
              >
                Dismiss &amp; Continue
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800 bg-[#07070d]">
          {messages.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-600 px-4">
              <Bot className="h-10 w-10 mb-3 text-slate-800" />
              <p className="text-xs font-semibold text-slate-500 mb-1">Playground Initialized</p>
              <p className="text-[10px] text-slate-600 max-w-xs leading-relaxed">
                Type a query to run the visual agentflow graph. Step traces will be streamed live as cards inline.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => {
            if (msg.role === "system") {
              return (
                <div
                  key={idx}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-950/60 border border-slate-900 text-[10px] text-slate-400 font-mono my-2 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200"
                >
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                    <Activity className="h-3.5 w-3.5" />
                  </div>
                  <span className="flex-1 leading-normal">{msg.content}</span>
                </div>
              );
            }

            return (
              <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-emerald-400" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-indigo-600/20 border border-indigo-500/30 text-indigo-200"
                      : "bg-slate-900/60 border border-slate-800/80 text-slate-300"
                  }`}
                >
                  {msg.role === "assistant" && msg.content ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: (props) => (
                          <div className="overflow-x-auto max-w-full my-2.5 rounded-xl border border-slate-800/80 bg-slate-950/50 p-1 shadow-sm [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-700">
                            <table className="w-full min-w-max border-collapse border border-slate-800 text-[11px] font-sans" {...props} />
                          </div>
                        ),
                        th: (props) => <th className="border border-slate-800 px-2 py-1.5 bg-slate-900/60 font-semibold text-slate-200 text-left" {...props} />,
                        td: (props) => <td className="border border-slate-800 px-2 py-1 text-slate-300" {...props} />,
                        h1: (props) => <h1 className="text-sm font-bold text-white mb-2 mt-3" {...props} />,
                        h2: (props) => <h2 className="text-xs font-bold text-white mb-1.5 mt-2.5" {...props} />,
                        h3: (props) => <h3 className="text-xs font-semibold text-slate-200 mb-1 mt-2" {...props} />,
                        h4: (props) => <h4 className="text-[11px] font-semibold text-slate-300 mb-1" {...props} />,
                        p: (props) => <p className="mb-2 leading-relaxed text-slate-300" {...props} />,
                        ul: (props) => <ul className="list-disc pl-4 space-y-1 mb-2" {...props} />,
                        ol: (props) => <ol className="list-decimal pl-4 space-y-1 mb-2" {...props} />,
                        li: (props) => <li className="mb-0.5 text-slate-350" {...props} />,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content || (streaming && idx === messages.length - 1 ? (
                      <span className="inline-flex gap-1 py-1">
                        <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </span>
                    ) : "")
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-4 w-4 text-indigo-400" />
                  </div>
                )}
              </div>
            );
          })}

          {pendingInterrupt && (
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
                  placeholder="Type parameters here (e.g. Vendor Name: Catering Co, Category: Catering)..."
                  className="w-full rounded-xl border-2 border-indigo-500/40 bg-[#06060b] p-4 text-base text-slate-100 placeholder-slate-500 outline-none resize-y focus:border-indigo-500 font-mono leading-relaxed transition-all min-h-[220px] shadow-inner"
                  rows={Math.max(8, (feedbackInput.match(/\n/g) || []).length + 1)}
                />
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
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-3.5 rounded-2xl border border-red-500/20 bg-red-950/20 text-red-400 text-[10px] leading-relaxed">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-slate-900 bg-slate-950 shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a test prompt (Shift+Enter for new line)..."
              disabled={streaming}
              rows={Math.min(5, Math.max(1, (input.match(/\n/g) || []).length + 1))}
              className="flex-1 rounded-xl border border-slate-800 bg-slate-900/30 py-2.5 px-4 text-xs text-white outline-none focus:border-emerald-500 disabled:opacity-40 placeholder-slate-600 resize-none font-sans leading-relaxed transition-all"
            />

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setExecutionModeDropdownOpen(!executionModeDropdownOpen);
                  setShowFeedbackForm(false);
                }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-[11px] font-bold text-slate-100 shadow-md transition-all whitespace-nowrap h-full"
                title={`Execution: ${
                  executionModeOverride === "inherit" ? "Inherit Default" :
                  executionModeOverride === "plan_first" ? "Plan First" : "Direct Execution"
                }`}
              >
                {executionModeOverride === "inherit" && "⚙️ Inherit"}
                {executionModeOverride === "plan_first" && "📋 Plan First"}
                {executionModeOverride === "direct" && "⚡ Direct"}
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>
              {executionModeDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExecutionModeDropdownOpen(false)} />
                  <div className="absolute bottom-full mb-1 right-0 z-20 min-w-[190px] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/80 py-1.5 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setExecutionModeOverride("inherit");
                        setExecutionModeDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs font-semibold transition-colors ${
                        executionModeOverride === "inherit"
                          ? "bg-indigo-600/25 text-indigo-300 border-l-2 border-indigo-500 font-bold"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      ⚙️ Inherit Agent Default
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExecutionModeOverride("plan_first");
                        setExecutionModeDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs font-semibold transition-colors ${
                        executionModeOverride === "plan_first"
                          ? "bg-indigo-600/25 text-indigo-300 border-l-2 border-indigo-500 font-bold"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      📋 Plan First
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExecutionModeOverride("direct");
                        setExecutionModeDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs font-semibold transition-colors ${
                        executionModeOverride === "direct"
                          ? "bg-indigo-600/25 text-indigo-300 border-l-2 border-indigo-500 font-bold"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      ⚡ Direct Execution
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
            >
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
