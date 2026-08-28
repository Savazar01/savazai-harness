"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Bot,
  Wrench,
  Database,
  Shield,
  Plus,
  Loader2,
  Check,
  Search,
  BookOpen,
  HardDrive,
  Fingerprint,
  BrainCircuit,
  Share2,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { HelpTooltip } from "@/components/shared/help-tooltip";
import { AiAssistButton } from "@/components/shared/ai-assist-button";
import { CanvasNode, ToolReference, AgentRole } from "./canvas-editor";

interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  category: "open" | "native" | "mcp" | "custom";
}

interface OkfConcept {
  id: string;
  conceptKey: string;
  category: string;
}

interface RegisteredTool {
  name: string;
  label: string;
  category: "native" | "custom" | "mcp" | "open";
  status: "active" | "needs_key";
  description: string;
}

interface AgentDrawerProps {
  node: CanvasNode;
  allNodes?: CanvasNode[];
  onClose: () => void;
  onSave: (updated: CanvasNode) => void;
}

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1", "o1-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-3.1-flash-lite", "gemini-3.7-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
  xai: ["grok-2", "grok-2-vision", "grok-beta"],
  omniroute: ["omniroute-default", "meta-llama-3-8b", "gpt-4o-mini"],
  local: ["llama-3.3-70b-instruct", "codellama-34b-instruct", "mistral-7b-instruct"],
};


const ROLE_TEMPLATES: { value: AgentRole; label: string; description: string }[] = [
  { value: "supervisor", label: "Supervisor Agent", description: "Coordinates workflow dispatch across sub-agents" },
  { value: "team", label: "Agent Team Container", description: "Groups and coordinates specialist workers in a clean container" },
  { value: "worker", label: "Worker / Specialist Agent", description: "Executes bound MCP/native tools" },
  { value: "synthesizer", label: "Synthesizer Agent", description: "Aggregates multi-agent outputs into cohesive responses" },
  { value: "scheduled", label: "Scheduled Autonomous Worker", description: "Executes recurring tasks on a cron schedule" },
];

export const COLOR_PRESETS = [
  { id: "default", label: "Default", bg: "bg-slate-900", border: "border-slate-700", ring: "ring-slate-500", dot: "#64748b" },
  { id: "emerald", label: "Emerald", bg: "bg-emerald-950", border: "border-emerald-500", ring: "ring-emerald-500", dot: "#10b981" },
  { id: "cyan", label: "Cyan", bg: "bg-cyan-950", border: "border-cyan-500", ring: "ring-cyan-500", dot: "#06b6d4" },
  { id: "indigo", label: "Indigo", bg: "bg-indigo-950", border: "border-indigo-500", ring: "ring-indigo-500", dot: "#6366f1" },
  { id: "purple", label: "Purple", bg: "bg-purple-950", border: "border-purple-500", ring: "ring-purple-500", dot: "#a855f7" },
  { id: "amber", label: "Amber", bg: "bg-amber-950", border: "border-amber-500", ring: "ring-amber-500", dot: "#f59e0b" },
  { id: "rose", label: "Rose", bg: "bg-rose-950", border: "border-rose-500", ring: "ring-rose-500", dot: "#f43f5e" },
  { id: "slate", label: "Slate", bg: "bg-slate-800", border: "border-slate-600", ring: "ring-slate-400", dot: "#94a3b8" },
];

export function AgentDrawer({ node, allNodes = [], onClose, onSave }: AgentDrawerProps) {
  const [activeTab, setActiveTab] = useState<"identity" | "tools" | "databases" | "social" | "mcp" | "knowledge" | "memory" | "guardrails">("identity");

  const [label, setLabel] = useState(node.label);
  const [roleTemplate, setRoleTemplate] = useState<AgentRole>(node.roleTemplate || "worker");
  const [parentId, setParentId] = useState<string | undefined>(node.parentId);
  const [customColor, setCustomColor] = useState<string>(node.customColor || "default");
  const [systemPrompt, setSystemPrompt] = useState(node.systemPrompt || "");
  const [provider, setProvider] = useState(node.modelConfig?.provider || "openai");
  const [model, setModel] = useState(node.modelConfig?.model || "gpt-4o");
  const [temperature, setTemperature] = useState(node.modelConfig?.temperature ?? 0.7);

  const [selectedTools, setSelectedTools] = useState<ToolReference[]>(node.tools || []);
  const [ragNamespace, setRagNamespace] = useState(node.ragNamespace || "default");
  const [embedModel, setEmbedModel] = useState(node.embedModel || "");
  const [hitlPolicy, setHitlPolicy] = useState<"always" | "on_delete" | "on_mutate" | "never">(node.hitlPolicy || "always");
  const [memoryCheckpoint, setMemoryCheckpoint] = useState(node.memoryCheckpoint ?? true);
  const [kvPersistence, setKvPersistence] = useState(node.kvPersistence ?? false);
  const [piiMaskingOverride, setPiiMaskingOverride] = useState(node.piiMaskingOverride || "");
  const [executionMode, setExecutionMode] = useState<"plan_first" | "direct">(node.data?.executionMode || "plan_first");

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);

  const [skillsCatalog, setSkillsCatalog] = useState<Skill[]>([]);
  const [okfConcepts, setOkfConcepts] = useState<OkfConcept[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);

  const [mcpServers, setMcpServers] = useState<{ serverId: string; tools: { name: string; description: string }[] }[]>([]);
  const [selectedMcpServer, setSelectedMcpServer] = useState<string>("");
  const [loadingMcp, setLoadingMcp] = useState(false);

  const [customApiName, setCustomApiName] = useState("");
  const [customApiUrl, setCustomApiUrl] = useState("");
  const [showCustomApiForm, setShowCustomApiForm] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    if (alertMessage) {
      const t = setTimeout(() => setAlertMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [alertMessage]);

  const [skillSearch, setSkillSearch] = useState("");
  const [skillFilter, setSkillFilter] = useState<string>("all");

  const [authoringSkill, setAuthoringSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [newSkillInstructions, setNewSkillInstructions] = useState("");
  const [savingSkill, setSavingSkill] = useState(false);

  const [llmProviders, setLlmProviders] = useState<{
    id: string;
    name: string;
    active: boolean;
    defaultModel?: string;
    models?: string[];
    discoveredModels?: string[];
  }[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [registeredTools, setRegisteredTools] = useState<RegisteredTool[]>([]);
  const [loadingRegisteredTools, setLoadingRegisteredTools] = useState(false);

  const availableModels = (() => {
    const providerCfg = llmProviders.find((p) => p.id === provider);
    if (providerCfg?.models && providerCfg.models.length > 0) {
      return providerCfg.models;
    }
    if (providerCfg?.discoveredModels && providerCfg.discoveredModels.length > 0) {
      return providerCfg.discoveredModels;
    }
    return PROVIDER_MODELS[provider] || ["gpt-4o", "gpt-4o-mini"];
  })();

  const fetchResources = useCallback(async () => {
    setLoadingResources(true);
    try {
      const [skillsRes, okfRes] = await Promise.all([
        fetch("/api/skills"),
        fetch("/api/okf"),
      ]);
      if (skillsRes.ok) {
        const data = await skillsRes.json();
        setSkillsCatalog(data.skills || []);
      }
      if (okfRes.ok) {
        const data = await okfRes.json();
        setOkfConcepts(data.concepts || []);
      }
    } catch (err) {
      console.error("Failed to load drawer catalog resources:", err);
    } finally {
      setLoadingResources(false);
    }
  }, []);

  const fetchMcpServers = useCallback(async () => {
    setLoadingMcp(true);
    try {
      const res = await fetch("/api/mcp");
      if (res.ok) {
        const data = await res.json();
        setMcpServers(data.servers || []);
        if (data.servers && data.servers.length > 0) {
          setSelectedMcpServer(data.servers[0].serverId);
        }
      }
    } catch (err) {
      console.error("Failed to load MCP servers:", err);
    } finally {
      setLoadingMcp(false);
    }
  }, []);

  const fetchLlmProviders = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        const activeProviders = (data.llmProviders || []).filter((p: { active: boolean }) => p.active);
        setLlmProviders(activeProviders);
        if (activeProviders.length > 0) {
          const currentActive = activeProviders.find((p: { id: string }) => p.id === provider);
          if (!currentActive) {
            const first = activeProviders[0];
            setProvider(first.id);
            setModel(first.defaultModel || first.models?.[0] || PROVIDER_MODELS[first.id]?.[0] || "gpt-4o");
          }
        }
      }
    } catch (err) {
      console.error("Failed to load LLM providers:", err);
    } finally {
      setLoadingProviders(false);
    }
  }, [provider]);

  const fetchRegisteredTools = useCallback(async () => {
    setLoadingRegisteredTools(true);
    try {
      const res = await fetch("/api/tools/registered");
      if (res.ok) {
        const data = await res.json();
        setRegisteredTools(data.tools || []);
      }
    } catch (err) {
      console.error("Failed to load registered tools:", err);
    } finally {
      setLoadingRegisteredTools(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchResources();
    fetchMcpServers();
    fetchLlmProviders();
    fetchRegisteredTools();
  }, [fetchResources, fetchMcpServers, fetchLlmProviders, fetchRegisteredTools]);

  const handleSave = () => {
    let newX = node.x;
    let newY = node.y;
    const finalParentId = roleTemplate === "team" ? undefined : parentId;

    if (finalParentId && finalParentId !== node.parentId) {
      const targetTeam = allNodes.find((t) => t.id === finalParentId);
      if (targetTeam) {
        const existingWorkers = allNodes.filter((c) => c.parentId === finalParentId && c.id !== node.id);
        const count = existingWorkers.length;
        const col = count % 2;
        const row = Math.floor(count / 2);
        newX = targetTeam.x + 24 + col * 260;
        newY = targetTeam.y + 70 + row * 130;
      }
    }

    const updated: CanvasNode = {
      ...node,
      label,
      roleTemplate,
      systemPrompt,
      modelConfig: { provider, model, temperature },
      tools: selectedTools,
      ragNamespace,
      embedModel,
      hitlPolicy,
      memoryCheckpoint,
      kvPersistence,
      piiMaskingOverride,
      parentId: finalParentId,
      customColor: customColor === "default" ? undefined : customColor,
      x: newX,
      y: newY,
      data: {
        ...node.data,
        executionMode,
      },
    };
    onSave(updated);
    onClose();
  };

  const handleToggleTool = (
    presetName: string,
    category: ToolReference["category"],
    mcpServerId?: string,
    config?: Record<string, unknown>,
  ) => {
    const exists = selectedTools.some(
      (t) => t.name === presetName && t.category === category && (category !== "mcp" || t.mcpServerId === mcpServerId),
    );
    if (exists) {
      setSelectedTools(selectedTools.filter(
        (t) => !(t.name === presetName && t.category === category && (category !== "mcp" || t.mcpServerId === mcpServerId)),
      ));
    } else {
      const newRef: ToolReference = {
        id: `tool-ref-${crypto.randomUUID()}`,
        name: presetName,
        category,
        mcpServerId,
        config,
      };
      setSelectedTools([...selectedTools, newRef]);
    }
  };

  const handleAddCustomApiTool = () => {
    if (!customApiName || !customApiUrl) {
      setAlertMessage("Please enter both custom tool name and endpoint URL.");
      return;
    }
    const cleanName = customApiName.trim().replace(/\s+/g, "_");
    handleToggleTool(cleanName, "native", undefined, { webhookUrl: customApiUrl.trim() });
    setCustomApiName("");
    setCustomApiUrl("");
    setShowCustomApiForm(false);
  };

  const handleCreateSkillInline = async () => {
    if (!newSkillName || !newSkillDesc || !newSkillInstructions) {
      setAlertMessage("Name, description, and instructions are required.");
      return;
    }
    setSavingSkill(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSkillName,
          description: newSkillDesc,
          instructions: newSkillInstructions,
          category: "custom",
          version: "1.0.0",
        }),
      });
      if (res.ok) {
        await fetchResources();
        const newRef: ToolReference = {
          id: `tool-ref-${crypto.randomUUID()}`,
          name: newSkillName,
          category: "custom",
        };
        setSelectedTools((prev) => [...prev, newRef]);
        setNewSkillName("");
        setNewSkillDesc("");
        setNewSkillInstructions("");
        setAuthoringSkill(false);
      }
    } catch (err) {
      console.error("Failed to author skill inline:", err);
    } finally {
      setSavingSkill(false);
    }
  };

  const filteredSkills = skillsCatalog.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
      s.description.toLowerCase().includes(skillSearch.toLowerCase());
    const matchesFilter = skillFilter === "all" || s.category === skillFilter;
    return matchesSearch && matchesFilter;
  });

  const currentMcpTools =
    mcpServers.find((s) => s.serverId === selectedMcpServer)?.tools || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className={`relative w-full ${isDrawerExpanded ? "max-w-5xl" : "max-w-xl"} h-full bg-slate-950 border-l border-slate-900 shadow-2xl flex flex-col z-10 transition-all duration-300`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-900 bg-slate-950/40 shrink-0">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-indigo-400" />
            <div>
              <h4 className="text-sm font-bold text-white">Agent Inspector</h4>
              <p className="text-[10px] text-slate-500">Configure identity, tools, knowledge, memory, and guardrails</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
              title={isDrawerExpanded ? "Collapse Inspector Width" : "Expand Inspector Width"}
              className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-900 rounded-xl transition-all flex items-center gap-1 text-[11px] font-bold"
            >
              {isDrawerExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-xl transition-all">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 8-Tab Bar */}
        <div className="flex overflow-x-auto border-b border-slate-900 bg-slate-950 px-6 shrink-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {(["identity", "tools", "databases", "social", "mcp", "knowledge", "memory", "guardrails"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3.5 px-4 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap -mb-[2px] ${
                activeTab === tab
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {tab === "tools" ? "NATIVE & CUSTOM TOOLS" :
               tab === "databases" ? "EXTERNAL DATABASES" :
               tab === "social" ? "SOCIAL MEDIA" :
               tab === "mcp" ? "MCP SERVERS" :
               tab === "memory" ? "Memory & History" : tab}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800">

          {/* TAB: IDENTITY */}
          {activeTab === "identity" && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Agent Name</label>
                  <HelpTooltip content="A human-readable label for this agent node. Used on the canvas and in execution logs to identify the agent." side="right" />
                </div>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/20 py-2.5 px-4 text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>

              {roleTemplate === "supervisor" && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Execution Strategy</label>
                    <HelpTooltip content="Decide whether the supervisor should pause and draft a plan first for human approval, or execute directly." side="right" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      onClick={() => setExecutionMode("plan_first")}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        executionMode === "plan_first"
                          ? "bg-indigo-500/10 border-indigo-500/30"
                          : "border-slate-800 bg-slate-900/20 hover:border-slate-700"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        executionMode === "plan_first" ? "border-indigo-500" : "border-slate-600"
                      }`}>
                        {executionMode === "plan_first" && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-white block">📋 Plan First</span>
                        <span className="text-[9px] text-slate-500">HITL Approval Required</span>
                      </div>
                    </div>
                    <div
                      onClick={() => setExecutionMode("direct")}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        executionMode === "direct"
                          ? "bg-indigo-500/10 border-indigo-500/30"
                          : "border-slate-800 bg-slate-900/20 hover:border-slate-700"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        executionMode === "direct" ? "border-indigo-500" : "border-slate-600"
                      }`}>
                        {executionMode === "direct" && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-white block">⚡ Direct Execution</span>
                        <span className="text-[9px] text-slate-500">Autonomous Run</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Role Template</label>
                <div className="grid grid-cols-1 gap-2">
                  {ROLE_TEMPLATES.map((rt) => (
                    <div
                      key={rt.value}
                      onClick={() => setRoleTemplate(rt.value)}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        roleTemplate === rt.value
                          ? "bg-indigo-500/10 border-indigo-500/30"
                          : "border-slate-800 bg-slate-900/20 hover:border-slate-700"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        roleTemplate === rt.value ? "border-indigo-500" : "border-slate-600"
                      }`}>
                        {roleTemplate === rt.value && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white block">{rt.label}</span>
                        <span className="text-[9px] text-slate-500">{rt.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {roleTemplate !== "supervisor" && roleTemplate !== "team" && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Assigned Team Container</label>
                    <HelpTooltip content="Assign this specialist worker to a visual Team Container to bundle execution into a clean bus pipeline." side="right" />
                  </div>
                  <select
                    value={parentId || ""}
                    onChange={(e) => setParentId(e.target.value ? e.target.value : undefined)}
                    className="w-full rounded-xl border border-slate-800 bg-[#06060b] px-3.5 py-2.5 text-xs text-white outline-none focus:border-indigo-500 font-medium"
                  >
                    <option value="">(None — Standalone Specialist)</option>
                    {allNodes
                      ?.filter((n) => n.roleTemplate === "team" && n.id !== node.id)
                      .map((team) => (
                        <option key={team.id} value={team.id}>
                          👥 {team.label || "Specialist Team"} ({allNodes.filter(c => c.parentId === team.id).length} specialists)
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Node Color Theme Swatches */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Node Color & Visual Theme</label>
                  <HelpTooltip content="Customize the visual border, glow, and background tint of this node card for instant identification." side="right" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setCustomColor(preset.id)}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
                        customColor === preset.id
                          ? `border-white ring-2 ${preset.ring} ${preset.bg} text-white shadow-lg`
                          : "border-slate-800 hover:border-slate-700 bg-slate-950/60 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: preset.dot }} />
                      <span className="truncate text-[11px] font-medium">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">System Directive Prompt</label>
                    <HelpTooltip content="The core system prompt defining the agent's identity, behavior rules, constraints, and execution guidelines. This is injected into every LLM call for this agent." side="right" />
                  </div>
                  <div className="flex items-center gap-2">
                    <AiAssistButton
                      onGenerated={(text) => setSystemPrompt(text)}
                      mode="generate"
                      domain="system-prompt"
                      placeholder="Describe the agent's role, goals, tools, and constraints..."
                    />
                    <button
                      type="button"
                      onClick={() => setIsPromptModalOpen(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white text-[9px] font-bold transition-all shrink-0"
                    >
                      <Maximize2 className="h-3 w-3" />
                      Expand
                    </button>
                  </div>
                </div>
                <textarea
                  rows={6}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Define the agent's role, behavior, and constraints..."
                  className="w-full rounded-xl border border-slate-800 bg-[#06060b] p-4 text-xs text-slate-300 font-mono outline-none resize-none focus:border-indigo-500 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800"
                />
              </div>

              {isPromptModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
                  <div className="relative bg-[#0a0a14] border border-slate-800 rounded-2xl p-6 max-w-4xl w-full h-[85vh] flex flex-col shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
                      <div className="flex items-center gap-2.5">
                        <Bot className="h-5 w-5 text-indigo-400" />
                        <div>
                          <h3 className="text-sm font-bold text-white">System Directive Prompt Editor — {label}</h3>
                          <p className="text-[10px] text-slate-500">Edit and refine full system prompt instructions, rules, and guidelines</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <AiAssistButton
                          onGenerated={(text) => setSystemPrompt(text)}
                          mode="generate"
                          domain="system-prompt"
                          placeholder="Describe the agent role, goals, and constraints..."
                        />
                        <button
                          type="button"
                          onClick={() => setIsPromptModalOpen(false)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col relative min-h-0">
                      <textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        placeholder="Define the agent's role, behavior, tools, and operational constraints..."
                        className="w-full h-full rounded-xl border border-slate-800 bg-[#06060b] p-4 text-xs text-slate-200 font-mono outline-none resize-none focus:border-indigo-500 leading-relaxed [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800"
                      />
                      <div className="absolute bottom-3 right-4 text-[10px] font-mono text-slate-500 bg-slate-950/80 px-2 py-1 rounded-md border border-slate-800 pointer-events-none">
                        {systemPrompt.length} chars | {systemPrompt.split('\n').length} lines
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsPromptModalOpen(false)}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all"
                      >
                        Done Editing
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">LLM Provider</label>
                  {loadingProviders ? (
                    <div className="flex items-center gap-2 py-2.5 px-4 rounded-xl border border-slate-800 bg-[#0c0c16] text-xs text-slate-500">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading providers...
                    </div>
                  ) : llmProviders.length === 0 ? (
                    <div className="py-2.5 px-4 rounded-xl border border-slate-800 bg-[#0c0c16] text-xs text-slate-500">
                      No providers configured. Go to Settings to add an LLM provider.
                    </div>
                  ) : (
                    <select
                      value={provider}
                      onChange={(e) => {
                        const newProvider = e.target.value;
                        setProvider(newProvider);
                        const cfg = llmProviders.find((p) => p.id === newProvider);
                        const firstMdl = cfg?.models?.[0] || cfg?.discoveredModels?.[0] || PROVIDER_MODELS[newProvider]?.[0] || "gpt-4o";
                        setModel(cfg?.defaultModel || firstMdl);
                      }}
                      className="w-full rounded-xl border border-slate-800 bg-[#0c0c16] py-2.5 px-4 text-xs text-white outline-none focus:border-indigo-500"
                    >
                      {llmProviders.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Model Version</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-[#0c0c16] py-2.5 px-4 text-xs text-white outline-none focus:border-indigo-500"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    {!availableModels.includes(model) && (
                      <option value={model}>{model}</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Temperature ({temperature})</label>
                  <HelpTooltip content="Controls randomness in LLM output. Lower values (0-0.3) for deterministic, factual responses. Higher values (0.7-1.5) for creative, varied outputs." side="right" />
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            </div>
          )}

          {/* TAB: NATIVE & CUSTOM TOOLS */}
          {activeTab === "tools" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Native &amp; Custom Tools</span>
                  <button
                    type="button"
                    onClick={() => setShowCustomApiForm(!showCustomApiForm)}
                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase"
                  >
                    <Plus className="h-3 w-3" /> Bind Custom Webhook/API
                  </button>
                </div>

                {showCustomApiForm && (
                  <div className="border border-purple-500/30 bg-slate-800/80 rounded-2xl p-4 space-y-3 animate-in slide-in-from-top duration-150">
                    <span className="text-[9px] font-bold text-slate-100 uppercase block tracking-wider">Add custom API or webhook tool</span>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={customApiName}
                        onChange={(e) => setCustomApiName(e.target.value)}
                        placeholder="Tool Name (e.g. check_calendar)"
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="url"
                        value={customApiUrl}
                        onChange={(e) => setCustomApiUrl(e.target.value)}
                        placeholder="Endpoint webhook URL (https://...)"
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                      />
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowCustomApiForm(false)}
                          className="px-3 py-1 rounded bg-slate-900 text-slate-300 hover:text-white text-[10px] font-semibold"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAddCustomApiTool}
                          className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold"
                        >
                          Bind API Webhook
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {loadingRegisteredTools && registeredTools.length === 0 ? (
                    <div className="flex justify-center items-center py-4 bg-slate-900/10 border border-slate-900 rounded-xl text-slate-500 text-[10px] gap-2 md:col-span-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tools...
                    </div>
                  ) : (() => {
                    const filtered = registeredTools.filter(t => t.category === "native" || t.category === "custom" || t.category === "open");
                    if (filtered.length === 0) return <p className="text-center text-slate-600 text-[10px] py-4 md:col-span-2">No native or dynamic tools found.</p>;
                    return filtered.map((tool) => {
                      const isChecked = selectedTools.some((t) => t.name === tool.name && t.category === tool.category);
                      const isKeyConfigured = tool.status === "active";
                      
                      return (
                        <div
                          key={tool.name}
                          onClick={() => handleToggleTool(tool.name, tool.category)}
                          className={`flex flex-col gap-2 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                            isChecked
                              ? "bg-emerald-950/10 border-emerald-500/60 text-emerald-100"
                              : "border-slate-900 bg-slate-950/20 hover:border-slate-800"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Wrench className={`h-4 w-4 shrink-0 ${isChecked ? "text-emerald-400" : "text-slate-600"}`} />
                              <span className="text-xs font-bold block truncate text-slate-200">{tool.label}</span>
                            </div>
                            {isChecked && (
                              <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 leading-normal line-clamp-2">
                            {tool.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 pt-1 mt-auto">
                            <span className="px-2 py-0.5 rounded-md border border-indigo-500/20 text-[8px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/5">
                              {tool.category}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md border text-[8px] font-bold uppercase tracking-wider ${
                              isKeyConfigured
                                ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5"
                                : "border-amber-500/20 text-amber-400 bg-amber-500/5"
                            }`}>
                              {isKeyConfigured ? "Active" : "Needs API Key"}
                            </span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* TAB: EXTERNAL DATABASES */}
          {activeTab === "databases" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">External Database Connectors</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {loadingRegisteredTools && registeredTools.length === 0 ? (
                    <div className="flex justify-center items-center py-4 bg-slate-900/10 border border-slate-900 rounded-xl text-slate-500 text-[10px] gap-2 md:col-span-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading databases...
                    </div>
                  ) : (() => {
                    const filtered = registeredTools.filter(t => (t.category as string) === "database");
                    if (filtered.length === 0) return <p className="text-left text-slate-600 text-[10px] py-2 md:col-span-2">No external database connections registered. Register them under settings to bind them here.</p>;
                    return filtered.map((tool) => {
                      const isChecked = selectedTools.some((t) => t.name === tool.name && t.category === tool.category);
                      const isKeyConfigured = tool.status === "active";
                      
                      return (
                        <div
                          key={tool.name}
                          onClick={() => handleToggleTool(tool.name, tool.category)}
                          className={`flex flex-col gap-2 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                            isChecked
                              ? "bg-emerald-950/10 border-emerald-500/60 text-emerald-100"
                              : "border-slate-900 bg-slate-950/20 hover:border-slate-800"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Database className={`h-4 w-4 shrink-0 ${isChecked ? "text-emerald-400" : "text-slate-600"}`} />
                              <span className="text-xs font-bold block truncate text-slate-200">{tool.label}</span>
                            </div>
                            {isChecked && (
                              <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 leading-normal line-clamp-2">
                            {tool.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 pt-1 mt-auto">
                            <span className="px-2 py-0.5 rounded-md border border-indigo-500/20 text-[8px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/5">
                              {tool.category}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md border text-[8px] font-bold uppercase tracking-wider ${
                              isKeyConfigured
                                ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5"
                                : "border-slate-500/20 text-slate-400 bg-slate-500/5"
                            }`}>
                              {isKeyConfigured ? "Connected" : "Inactive"}
                            </span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* TAB: SOCIAL MEDIA */}
          {activeTab === "social" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Social Media Integration Hub</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {loadingRegisteredTools && registeredTools.length === 0 ? (
                    <div className="flex justify-center items-center py-4 bg-slate-900/10 border border-slate-900 rounded-xl text-slate-500 text-[10px] gap-2 md:col-span-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading social connections...
                    </div>
                  ) : (() => {
                    const filtered = registeredTools.filter(t => (t.category as string) === "social_media");
                    if (filtered.length === 0) return <p className="text-left text-slate-600 text-[10px] py-2 md:col-span-2">No social media connections configured. Configure them under settings to bind them here.</p>;
                    return filtered.map((tool) => {
                      const isChecked = selectedTools.some((t) => t.name === tool.name && t.category === tool.category);
                      const isKeyConfigured = tool.status === "active";
                      
                      return (
                        <div
                          key={tool.name}
                          onClick={() => handleToggleTool(tool.name, tool.category)}
                          className={`flex flex-col gap-2 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                            isChecked
                              ? "bg-emerald-950/10 border-emerald-500/60 text-emerald-100"
                              : "border-slate-900 bg-slate-950/20 hover:border-slate-800"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Share2 className={`h-4 w-4 shrink-0 ${isChecked ? "text-emerald-400" : "text-slate-600"}`} />
                              <span className="text-xs font-bold block truncate text-slate-200">{tool.label}</span>
                            </div>
                            {isChecked && (
                              <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 leading-normal line-clamp-2">
                            {tool.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 pt-1 mt-auto">
                            <span className="px-2 py-0.5 rounded-md border border-indigo-500/20 text-[8px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/5">
                              {tool.category.replace("_", " ")}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md border text-[8px] font-bold uppercase tracking-wider ${
                              isKeyConfigured
                                ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5"
                                : "border-slate-500/20 text-slate-400 bg-slate-500/5"
                            }`}>
                              {isKeyConfigured ? "Connected" : "Inactive"}
                            </span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* TAB: MCP SERVERS */}
          {activeTab === "mcp" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">MCP Server Tools</span>
                {mcpServers.length === 0 ? (
                  <div className="flex items-center justify-center py-4 bg-slate-900/10 border border-slate-900 rounded-xl text-slate-500 text-[10px] gap-2">
                    {loadingMcp ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading MCP Servers...
                      </>
                    ) : (
                      "No MCP servers configured or active."
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase shrink-0">Server:</label>
                      <select
                        value={selectedMcpServer}
                        onChange={(e) => setSelectedMcpServer(e.target.value)}
                        className="flex-1 rounded-xl border border-slate-800 bg-[#07070d] py-1.5 px-3 text-xs text-white outline-none focus:border-indigo-500"
                      >
                        {mcpServers.map((s) => (
                          <option key={s.serverId} value={s.serverId}>{s.serverId}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800">
                      {currentMcpTools.length === 0 ? (
                        <p className="text-center text-slate-600 text-[10px] py-4">No tools discovered on this server.</p>
                      ) : (
                        currentMcpTools.map((tool) => {
                          const isChecked = selectedTools.some(
                            (t) => t.name === tool.name && t.category === "mcp" && t.mcpServerId === selectedMcpServer,
                          );
                          return (
                            <div
                              key={`${selectedMcpServer}::${tool.name}`}
                              onClick={() => handleToggleTool(tool.name, "mcp", selectedMcpServer)}
                              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                isChecked
                                  ? "bg-emerald-950/20 border-emerald-500/80 text-emerald-100"
                                  : "border-slate-900 bg-slate-950/20 hover:border-slate-800"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <span className="font-mono text-xs font-bold text-slate-200 block truncate">{tool.name}</span>
                                <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">{tool.description}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {isChecked && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[8px] font-bold">
                                    <Check className="h-2.5 w-2.5" /> Active
                                  </span>
                                )}
                                <span className="px-1.5 py-0.5 rounded border border-purple-500/30 text-[8px] font-semibold capitalize shrink-0 text-slate-100 bg-slate-800/80">
                                  {selectedMcpServer}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: KNOWLEDGE & RAG */}
          {activeTab === "knowledge" && (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-cyan-400" />
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">pgvector RAG Namespace</label>
                  <HelpTooltip content="The vector namespace this agent queries for RAG retrieval. Documents are chunked, embedded, and stored by namespace. Leave as 'default' for shared access." side="right" />
                </div>
                <p className="text-[10px] text-slate-500">Assign a vector namespace the agent can query via RAG retrieval.</p>
                <input
                  type="text"
                  value={ragNamespace}
                  onChange={(e) => setRagNamespace(e.target.value)}
                  placeholder="e.g. corporate-rules-anonymized"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/20 py-2.5 px-4 text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>

              {/* Embedding Model Selector */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-emerald-400" />
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Embedding Model</label>
                </div>
                <p className="text-[10px] text-slate-500">Select a text-embedding model from the active provider&apos;s allowed models for RAG vector search.</p>
                <select
                  value={embedModel}
                  onChange={(e) => setEmbedModel(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#0c0c16] py-2.5 px-4 text-xs text-white outline-none focus:border-indigo-500"
                >
                  <option value="">No embedding — fallback to text search</option>
                  {(() => {
                    const providerCfg = llmProviders.find((p) => p.id === provider);
                    const providerModels = providerCfg?.models && providerCfg.models.length > 0
                      ? providerCfg.models
                      : providerCfg?.discoveredModels || PROVIDER_MODELS[provider] || [];
                    const embedModels = providerModels.filter((m: string) =>
                      m.toLowerCase().includes("embedding") || m.toLowerCase().includes("ada") || m.toLowerCase().includes("text-embed")
                    );
                    return embedModels.map((m: string) => <option key={m} value={m}>{m}</option>);
                  })()}
                  {(() => {
                    const providerCfg = llmProviders.find((p) => p.id === provider);
                    const providerModels = providerCfg?.models && providerCfg.models.length > 0
                      ? providerCfg.models
                      : providerCfg?.discoveredModels || PROVIDER_MODELS[provider] || [];
                    return embedModel && !providerModels.some((m: string) => m === embedModel) ? (
                      <option value={embedModel}>{embedModel} (current)</option>
                    ) : null;
                  })()}
                </select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-indigo-400" />
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">OKF v0.1 Concept Bundles</label>
                </div>
                <p className="text-[10px] text-slate-500">Bind shared business guidelines appended to agent execution state context.</p>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800">
                  {loadingResources && okfConcepts.length === 0 ? (
                    <div className="flex justify-center items-center py-6 text-slate-500 text-[10px] gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading OKF database...
                    </div>
                  ) : okfConcepts.length === 0 ? (
                    <p className="text-center text-slate-600 text-[10px] py-6">No OKF concepts found in registry database.</p>
                  ) : (
                    okfConcepts.map((c) => {
                      const toolPresetName = `okf-${c.conceptKey}`;
                      const isChecked = selectedTools.some((t) => t.name === toolPresetName);
                      return (
                        <div
                          key={c.id}
                          onClick={() => handleToggleTool(toolPresetName, "native")}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            isChecked
                              ? "bg-indigo-500/5 border-indigo-500/30 text-white"
                              : "border-slate-900 bg-slate-950/20 hover:border-slate-800"
                          }`}
                        >
                          <Check className={`h-4 w-4 shrink-0 ${isChecked ? "text-indigo-400" : "text-slate-700"}`} />
                          <div className="min-w-0">
                            <span className="font-mono text-xs font-bold block truncate">{c.conceptKey}</span>
                            <span className="text-[8px] font-medium text-slate-500 uppercase">{c.category}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              {/* Skills Catalog rendering moved from tools tab */}
              <div className="space-y-3 border-t border-slate-900 pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Skills Catalog</span>
                  <button
                    type="button"
                    onClick={() => setAuthoringSkill(!authoringSkill)}
                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase"
                  >
                    <Plus className="h-3 w-3" /> Author New Skill
                  </button>
                </div>

                {authoringSkill && (
                  <div className="border border-slate-800 bg-slate-950/50 rounded-2xl p-4 space-y-3 animate-in fade-in duration-200">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block tracking-wider">Create Local Custom Skill</span>
                    <input
                      type="text"
                      value={newSkillName}
                      onChange={(e) => setNewSkillName(e.target.value)}
                      placeholder="Skill name (e.g. format_report)"
                      className="w-full rounded-xl border border-slate-800 bg-slate-900/30 py-2 px-3 text-xs text-white outline-none focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      value={newSkillDesc}
                      onChange={(e) => setNewSkillDesc(e.target.value)}
                      placeholder="One-sentence description..."
                      className="w-full rounded-xl border border-slate-800 bg-slate-900/30 py-2 px-3 text-xs text-white outline-none focus:border-indigo-500"
                    />
                    <textarea
                      rows={4}
                      value={newSkillInstructions}
                      onChange={(e) => setNewSkillInstructions(e.target.value)}
                      placeholder="Instructions / logic..."
                      className="w-full rounded-xl border border-slate-800 bg-slate-900/30 py-2 px-3 text-xs text-white font-mono outline-none focus:border-indigo-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAuthoringSkill(false)}
                        className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 hover:text-white text-[10px] font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateSkillInline}
                        disabled={savingSkill}
                        className="flex items-center gap-1 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold"
                      >
                        {savingSkill ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save & Bind"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 shrink-0">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      value={skillSearch}
                      onChange={(e) => setSkillSearch(e.target.value)}
                      placeholder="Search skill catalog..."
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-4 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <select
                    value={skillFilter}
                    onChange={(e) => setSkillFilter(e.target.value)}
                    className="rounded-xl border border-slate-800 bg-[#090912] py-2 px-3 text-xs text-slate-300 outline-none"
                  >
                    <option value="all">All Types</option>
                    <option value="custom">Custom</option>
                    <option value="open">Open</option>
                    <option value="native">Native</option>
                    <option value="mcp">MCP</option>
                  </select>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800">
                  {loadingResources && skillsCatalog.length === 0 ? (
                    <div className="flex justify-center items-center py-6 text-slate-500 text-[10px] gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading Skills...
                    </div>
                  ) : filteredSkills.length === 0 ? (
                    <p className="text-center text-slate-600 text-[10px] py-6">No matching catalog skills found.</p>
                  ) : (
                    filteredSkills.map((s) => {
                      const isChecked = selectedTools.some((t) => t.name === s.name);
                      return (
                        <div
                          key={s.id}
                          onClick={() => handleToggleTool(s.name, s.category)}
                          className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            isChecked
                              ? "bg-emerald-950/20 border-emerald-500/80 text-emerald-100"
                              : "border-slate-900 bg-slate-950/20 hover:border-slate-800"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-xs font-bold text-slate-200 block truncate">{s.name}</span>
                            <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">{s.description}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isChecked && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[8px] font-bold">
                                <Check className="h-2.5 w-2.5" /> Active
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded border border-purple-500/30 text-[8px] font-semibold capitalize shrink-0 text-slate-100 bg-slate-800/80">
                              {s.category}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: MEMORY & HISTORY */}
          {activeTab === "memory" && (
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-indigo-400" />
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Short-Term Memory (Thread Checkpointing)</label>
                  <HelpTooltip content="When enabled, the agent preserves conversation context across turns within the same thread. Disable to force stateless behavior for each interaction." side="right" />
                </div>
                <p className="text-[10px] text-slate-500">
                  Enables conversational session memory. The agent will remember context from previous turns within the same thread.
                </p>
                <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-800 bg-slate-900/20">
                  <button
                    type="button"
                    onClick={() => setMemoryCheckpoint(!memoryCheckpoint)}
                    className={`relative w-10 h-5 rounded-full transition-all ${
                      memoryCheckpoint ? "bg-indigo-600" : "bg-slate-700"
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                      memoryCheckpoint ? "left-5" : "left-0.5"
                    }`} />
                  </button>
                  <span className="text-xs text-slate-300">
                    {memoryCheckpoint ? "Thread checkpointing enabled" : "Thread checkpointing disabled"}
                  </span>
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-900 pt-5">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-emerald-400" />
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Long-Term Key-Value Persistence</label>
                  <HelpTooltip content="Enables persistent key-value storage across threads. The agent can store and retrieve long-term data using a shared KV namespace." side="right" />
                </div>
                <p className="text-[10px] text-slate-500">
                  Persist key-value state across threads. The agent can store and retrieve long-term data using a shared KV store.
                </p>
                <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-800 bg-slate-900/20">
                  <button
                    type="button"
                    onClick={() => setKvPersistence(!kvPersistence)}
                    className={`relative w-10 h-5 rounded-full transition-all ${
                      kvPersistence ? "bg-emerald-600" : "bg-slate-700"
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                      kvPersistence ? "left-5" : "left-0.5"
                    }`} />
                  </button>
                  <span className="text-xs text-slate-300">
                    {kvPersistence ? "KV persistence enabled" : "KV persistence disabled"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB: GUARDRAILS & HITL */}
          {activeTab === "guardrails" && (
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-red-400" />
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">HITL Approval Gate Policy</label>
                  <HelpTooltip content="Human-in-the-Loop (HITL) policy determines when agent actions require manual approval. 'Always Intercept' pauses all runs; 'On Delete' intercepts destructive operations." side="right" />
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Configure safety constraints. When the agent plans an action matching the threshold, execution freezes and requires manual approval.
                </p>
                <select
                  value={hitlPolicy}
                  onChange={(e) => setHitlPolicy(e.target.value as "always" | "on_delete" | "on_mutate" | "never")}
                  className="w-full rounded-xl border border-slate-800 bg-[#0d0d17] py-2.5 px-4 text-xs text-white outline-none focus:border-indigo-500"
                >
                  <option value="always">Always Intercept (Require human sign-off on every run)</option>
                  <option value="on_delete">On Delete Actions (Flag endpoints starting with delete_)</option>
                  <option value="on_mutate">On Mutating Actions (Create, Update, Delete etc.)</option>
                  <option value="never">Auto-approve All (Warning: bypasses safety checks)</option>
                </select>
              </div>

              <div className="space-y-3 border-t border-slate-900 pt-5">
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-purple-400" />
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">PII Masking Override</label>
                  <HelpTooltip content="Custom regex patterns for PII masking specific to this agent. Patterns are comma-separated. Leave empty to use the system-wide compliance rules defined in Business Center." side="right" />
                </div>
                <p className="text-[10px] text-slate-500">
                  Custom PII patterns to mask for this agent (comma-separated regex patterns). Leave empty for default masking rules.
                </p>
                <input
                  type="text"
                  value={piiMaskingOverride}
                  onChange={(e) => setPiiMaskingOverride(e.target.value)}
                  placeholder="e.g. \b\d{3}-\d{2}-\d{4}\b, \b[A-Z]{2}\d{6}\b"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/20 py-2.5 px-4 text-xs text-white font-mono outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-900 bg-slate-950 shrink-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-semibold transition-all bg-slate-950/20"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/15"
          >
            Apply Configuration
          </button>
        </div>
      </div>

      {alertMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-950/80 border border-red-500/40 text-red-400 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl backdrop-blur flex items-center gap-2 animate-in fade-in slide-in-from-bottom duration-250">
          <span>⚠️ {alertMessage}</span>
          <button onClick={() => setAlertMessage(null)} className="text-red-400/65 hover:text-red-450 p-0.5 rounded hover:bg-red-900/20">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
