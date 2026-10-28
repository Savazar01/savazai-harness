"use client";

import React, { useState, useEffect } from "react";
import {
  Bot,
  Wrench,
  Sparkles,
  Clock,
  Lock,
  Unlock,
  X,
  Save,
  RefreshCw,
  Cpu,
  Layers,
  Sliders,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { AiAssistButton } from "@/components/shared/ai-assist-button";
import { AgentCatalogItem } from "@/app/api/agents/route";
import { Badge } from "@/components/ui/badge";

interface AgentEditorModalProps {
  agent?: AgentCatalogItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const PROVIDER_OPTIONS = [
  { value: "OpenAI", label: "OpenAI" },
  { value: "Anthropic", label: "Anthropic" },
  { value: "Gemini", label: "Google Gemini" },
  { value: "Groq", label: "Groq LPU" },
  { value: "xAI", label: "xAI Grok" },
  { value: "Local", label: "Local / vLLM" },
];

const MODEL_PRESETS: Record<string, string[]> = {
  OpenAI: ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1", "gpt-4-turbo"],
  Anthropic: ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
  Gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro"],
  Groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
  xAI: ["grok-2", "grok-2-vision"],
  Local: ["llama-3.3-70b-instruct", "mistral-7b-instruct"],
};

const DEFAULT_ROLE_PROMPTS: Record<string, string> = {
  supervisor:
    "You are an enterprise Supervisor Agent. Formulate high-level execution strategies, evaluate incoming requests, delegate subtasks across specialist teams, and oversee state transitions.",
  specialist:
    "You are a dedicated Specialist Agent. Execute assigned domain tasks using bound MCP and native tools. Return structured, verified outputs.",
  worker:
    "You are a dedicated Worker Agent. Execute assigned domain tasks using bound MCP and native tools. Return structured, verified outputs.",
  synthesizer:
    "You are an executive Synthesizer Agent. Review ground-truth execution receipts from all specialist nodes, format currency and metrics, hide internal technical IDs, and compose an executive summary.",
  scheduled:
    "You are an autonomous Scheduled Worker. Execute periodic automation pipelines on a configured cron cadence, evaluate health metrics, and emit execution summaries.",
};

export function AgentEditorModal({ agent, isOpen, onClose, onSaved }: AgentEditorModalProps) {
  const isEditing = Boolean(agent && agent.id);

  const [name, setName] = useState("");
  const [agentKey, setAgentKey] = useState("");
  const [role, setRole] = useState<string>("worker");
  const [description, setDescription] = useState("");
  const [llmProvider, setLlmProvider] = useState("OpenAI");
  const [modelName, setModelName] = useState("gpt-4o-mini");
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [allowModificationInFlow, setAllowModificationInFlow] = useState(true);

  const [registeredTools, setRegisteredTools] = useState<Array<{ name: string; label: string; category?: string }>>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form state
  useEffect(() => {
    if (agent) {
      setName(agent.name || "");
      setAgentKey(agent.agentKey || "");
      setRole(agent.role || "worker");
      setDescription(agent.description || "");
      setLlmProvider(agent.llmProvider || "OpenAI");
      setModelName(agent.modelName || "gpt-4o-mini");
      setTemperature(Number(agent.temperature) || 0.7);
      setSystemPrompt(agent.systemPrompt || "");
      setIsLocked(Boolean(agent.isLocked));
      setAllowModificationInFlow(agent.allowModificationInFlow !== false);
      setSelectedTools(Array.isArray(agent.boundTools) ? agent.boundTools.map((t: any) => (typeof t === "string" ? t : t.name)) : []);
    } else {
      setName("");
      setAgentKey("");
      setRole("worker");
      setDescription("");
      setLlmProvider("OpenAI");
      setModelName("gpt-4o-mini");
      setTemperature(0.7);
      setSystemPrompt(DEFAULT_ROLE_PROMPTS.worker);
      setIsLocked(false);
      setAllowModificationInFlow(true);
      setSelectedTools([]);
    }
    setError(null);
  }, [agent, isOpen]);

  // Fetch available registered tools
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/tools/registered")
      .then((res) => (res.ok ? res.json() : { tools: [] }))
      .then((data) => {
        if (Array.isArray(data.tools)) {
          setRegisteredTools(data.tools);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    if (!systemPrompt || Object.values(DEFAULT_ROLE_PROMPTS).includes(systemPrompt)) {
      setSystemPrompt(DEFAULT_ROLE_PROMPTS[newRole] || DEFAULT_ROLE_PROMPTS.worker);
    }
  };

  const handleProviderChange = (newProvider: string) => {
    setLlmProvider(newProvider);
    const presets = MODEL_PRESETS[newProvider] || [];
    if (presets.length > 0 && !presets.includes(modelName)) {
      setModelName(presets[0]);
    }
  };

  const toggleTool = (toolName: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolName) ? prev.filter((t) => t !== toolName) : [...prev, toolName]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please provide an agent name.");
      return;
    }
    if (!systemPrompt.trim()) {
      setError("Please provide a system directive prompt.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        agentKey: agentKey.trim() || undefined,
        role,
        description: description.trim(),
        llmProvider,
        modelName,
        temperature,
        systemPrompt: systemPrompt.trim(),
        boundTools: selectedTools,
        isLocked,
        allowModificationInFlow,
      };

      const url = isEditing ? `/api/agents/${agent!.id}` : "/api/agents";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server responded with ${res.status}`);
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative bg-card border border-border text-card-foreground rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {isEditing ? `Edit Agent: ${agent?.name}` : "Create Standalone Agent"}
              </h2>
              <p className="text-xs text-muted-foreground">
                Configure universal agent directives, LLM parameters, tool bindings, and governance policies
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Identity Section */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-primary" /> 1. Agent Identity & Role
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Agent Display Name <span className="text-primary">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Risk Auditor Specialist"
                  className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Agent Key / Slug <span className="text-muted-foreground font-normal">(Unique Identifier)</span>
                </label>
                <input
                  type="text"
                  value={agentKey}
                  onChange={(e) => setAgentKey(e.target.value)}
                  placeholder="e.g. risk-auditor-agent (auto-generated if blank)"
                  className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Operational Role Archetype
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "supervisor", label: "Supervisor", icon: Bot },
                    { id: "worker", label: "Specialist / Worker", icon: Wrench },
                    { id: "synthesizer", label: "Synthesizer", icon: Sparkles },
                    { id: "scheduled", label: "Scheduled Worker", icon: Clock },
                  ].map((r) => {
                    const Icon = r.icon;
                    const isSelected = role === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleRoleChange(r.id)}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 text-xs font-medium transition-all ${
                          isSelected
                            ? "bg-primary/10 border-primary text-primary font-bold shadow-xs"
                            : "bg-background border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{r.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Agent Description & Scope
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly describe what this agent does, its target domain, and responsibilities..."
                  rows={3}
                  className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Model Engine Configuration */}
          <div className="space-y-4 pt-2 border-t border-border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-primary" /> 2. Model & Execution Parameters
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">LLM Provider</label>
                <select
                  value={llmProvider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {PROVIDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Model Name</label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="e.g. gpt-4o-mini"
                  list="model-presets-list"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <datalist id="model-presets-list">
                  {(MODEL_PRESETS[llmProvider] || []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-foreground">Temperature</label>
                  <span className="text-xs font-mono text-muted-foreground">{temperature.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-primary mt-1"
                />
              </div>
            </div>
          </div>

          {/* System Directive Prompt Editor */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-primary" /> 3. System Directive Prompt
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-mono">
                  {systemPrompt.length} chars
                </span>
                <AiAssistButton
                  onGenerated={(text) => setSystemPrompt(text)}
                  mode="generate"
                  domain="system-prompt"
                  placeholder="Describe the agent's instructions, operational constraints, and style..."
                />
              </div>
            </div>

            <MarkdownEditor
              value={systemPrompt}
              onChange={setSystemPrompt}
              minHeight="220px"
              placeholder="Define the agent's core instructions, SOPs, reasoning protocol, and constraints..."
            />
          </div>

          {/* Bound Tools & Capabilities */}
          <div className="space-y-3 pt-2 border-t border-border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Wrench className="w-3.5 h-3.5 text-primary" /> 4. Bound Tools ({selectedTools.length} Selected)
            </h3>
            <p className="text-xs text-muted-foreground">
              Select connected tools from MCP servers or local skills that this agent can execute.
            </p>

            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 bg-background/50 rounded-xl border border-border">
              {registeredTools.length === 0 ? (
                <span className="text-xs text-muted-foreground italic p-2">No registered tools found.</span>
              ) : (
                registeredTools.map((tool) => {
                  const isSelected = selectedTools.includes(tool.name);
                  return (
                    <button
                      key={tool.name}
                      type="button"
                      onClick={() => toggleTool(tool.name)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 border ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-xs font-semibold"
                          : "bg-card text-muted-foreground hover:text-foreground border-border"
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="w-3 h-3" />}
                      <span>{tool.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Enterprise Governance & Lock Policies */}
          <div className="space-y-4 pt-2 border-t border-border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-primary" /> 5. Enterprise Governance & Lock Policy
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={() => setIsLocked(!isLocked)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                  isLocked
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                    : "bg-background border-border text-foreground hover:bg-muted/40"
                }`}
              >
                <div className="p-1.5 rounded-lg bg-card border border-border mt-0.5">
                  {isLocked ? <Lock className="w-4 h-4 text-amber-500" /> : <Unlock className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div>
                  <div className="text-xs font-bold">Lock Enterprise Policy</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    When placed inside an Agentflow canvas, prompt directives and core bindings cannot be edited by canvas operators unless explicitly detached/forked.
                  </div>
                </div>
              </div>

              <div
                onClick={() => setAllowModificationInFlow(!allowModificationInFlow)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                  allowModificationInFlow
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                    : "bg-background border-border text-foreground hover:bg-muted/40"
                }`}
              >
                <div className="p-1.5 rounded-lg bg-card border border-border mt-0.5">
                  <CheckCircle2 className={`w-4 h-4 ${allowModificationInFlow ? "text-emerald-500" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <div className="text-xs font-bold">Allow In-Flow Customization</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Permits workflow builders to override temperature or attach supplementary workflow tools without changing the catalog definition.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20 shrink-0">
          <div className="text-xs text-muted-foreground">
            {isEditing ? `Modifying version for ${agent?.agentKey}` : "New agents will be versioned automatically."}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 shadow-xs transition-all disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{isEditing ? "Save Changes" : "Create Agent"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
