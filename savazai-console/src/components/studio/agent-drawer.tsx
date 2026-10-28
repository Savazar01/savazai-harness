"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  Lock,
  Unlock,
} from "lucide-react";
import { HelpTooltip } from "@/components/shared/help-tooltip";
import { AiAssistButton } from "@/components/shared/ai-assist-button";
import { ToolDataTable, ToolItem } from "./tool-data-table";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { CanvasNode, ToolReference, AgentRole } from "./canvas-editor";

interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  category: "open" | "native" | "mcp" | "custom" | string;
}

interface OkfConcept {
  id: string;
  conceptKey: string;
  category: string;
  markdownBody?: string;
  yamlFrontmatter?: string;
}

interface RegisteredTool {
  name: string;
  label: string;
  category: "native" | "custom" | "mcp" | "open" | string;
  status: "active" | "needs_key";
  description: string;
}

export interface AgentDrawerProps {
  mode?: "flow_node" | "standalone_builder";
  node: CanvasNode;
  allNodes?: CanvasNode[];
  onClose: () => void;
  onSave: (updated: CanvasNode) => void | Promise<void>;
  workflowId?: string;
  workflowName?: string;
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
  { id: "default", label: "Default", bg: "bg-muted/60", border: "border-border", ring: "ring-primary/40", dot: "#64748b" },
  { id: "emerald", label: "Emerald", bg: "bg-emerald-500/10 dark:bg-emerald-950/40", border: "border-emerald-500/40", ring: "ring-emerald-500/40", dot: "#10b981" },
  { id: "cyan", label: "Cyan", bg: "bg-cyan-500/10 dark:bg-cyan-950/40", border: "border-cyan-500/40", ring: "ring-cyan-500/40", dot: "#06b6d4" },
  { id: "indigo", label: "Indigo", bg: "bg-indigo-500/10 dark:bg-indigo-950/40", border: "border-indigo-500/40", ring: "ring-indigo-500/40", dot: "#6366f1" },
  { id: "purple", label: "Purple", bg: "bg-purple-500/10 dark:bg-purple-950/40", border: "border-purple-500/40", ring: "ring-purple-500/40", dot: "#a855f7" },
  { id: "amber", label: "Amber", bg: "bg-amber-500/10 dark:bg-amber-950/40", border: "border-amber-500/40", ring: "ring-amber-500/40", dot: "#f59e0b" },
  { id: "rose", label: "Rose", bg: "bg-rose-500/10 dark:bg-rose-950/40", border: "border-rose-500/40", ring: "ring-rose-500/40", dot: "#f43f5e" },
  { id: "slate", label: "Slate", bg: "bg-muted/70 dark:bg-muted/40", border: "border-border", ring: "ring-border", dot: "#94a3b8" },
];

export function AgentDrawer({
  mode = "flow_node",
  node,
  allNodes = [],
  onClose,
  onSave,
  workflowId,
  workflowName,
}: AgentDrawerProps) {
  const [activeTab, setActiveTab] = useState<"identity" | "tools" | "databases" | "social" | "mcp" | "knowledge" | "memory" | "guardrails">("identity");
  const [isNodeLocked, setIsNodeLocked] = useState<boolean>(Boolean(node.isLocked || (node.data as any)?.isLocked));
  const [allowModificationInFlow, setAllowModificationInFlow] = useState<boolean>((node.data as any)?.allowModificationInFlow !== false);

  const [label, setLabel] = useState(node.label);
  const [description, setDescription] = useState<string>((node.data?.description as string) || "");
  const [agentKey, setAgentKey] = useState<string>((node.data?.agentKey as string) || "");
  const [saving, setSaving] = useState(false);
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

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
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

  const handleForkAgent = () => {
    const forked: CanvasNode = {
      ...node,
      label: `${label} (Customized)`,
      isLocked: false,
      data: {
        ...node.data,
        isLocked: false,
        catalogAgentId: undefined,
      },
    };
    onSave(forked);
    onClose();
  };

  const handleSave = async () => {
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

    if (systemPrompt && systemPrompt.trim() !== (node.systemPrompt || "").trim()) {
      fetch("/api/studio/prompt-revisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: node.id,
          agentName: label,
          agentRole: roleTemplate,
          agentflowId: workflowId || "standalone",
          agentflowTitle: workflowName || (mode === "standalone_builder" ? "Standalone Agent Builder" : undefined),
          systemPrompt: systemPrompt.trim(),
        }),
      }).catch((e) => console.warn("[prompt-revision snapshot error]:", e));
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
      isLocked: isNodeLocked,
      x: newX,
      y: newY,
      data: {
        ...node.data,
        description,
        agentKey,
        executionMode,
        isLocked: isNodeLocked,
        allowModificationInFlow,
      },
    };

    try {
      setSaving(true);
      await onSave(updated);
      onClose();
    } catch (err) {
      setAlertMessage(err instanceof Error ? err.message : "Failed to apply agent configuration.");
    } finally {
      setSaving(false);
    }
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

  const selectedToolKeys = useMemo(() => {
    return new Set(
      selectedTools.map((t) =>
        t.mcpServerId ? `${t.mcpServerId}::${t.name}` : `${t.category}::${t.name}`
      )
    );
  }, [selectedTools]);

  const handleToggleToolItem = (tool: ToolItem) => {
    handleToggleTool(tool.name, tool.category as any, tool.serverId);
  };

  const handleBulkToggleTools = (toolsToToggle: ToolItem[], enable: boolean) => {
    if (enable) {
      const newItems: ToolReference[] = [];
      for (const tool of toolsToToggle) {
        const key = tool.serverId ? `${tool.serverId}::${tool.name}` : `${tool.category}::${tool.name}`;
        if (!selectedToolKeys.has(key)) {
          newItems.push({
            id: `tool-ref-${crypto.randomUUID()}`,
            name: tool.name,
            category: tool.category as any,
            mcpServerId: tool.serverId,
          });
        }
      }
      setSelectedTools((prev) => [...prev, ...newItems]);
    } else {
      const keysToRemove = new Set(
        toolsToToggle.map((t) => (t.serverId ? `${t.serverId}::${t.name}` : `${t.category}::${t.name}`))
      );
      setSelectedTools((prev) =>
        prev.filter((t) => {
          const key = t.mcpServerId ? `${t.mcpServerId}::${t.name}` : `${t.category}::${t.name}`;
          return !keysToRemove.has(key);
        })
      );
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

  const [knowledgeSearch, setKnowledgeSearch] = useState("");

  const filteredKnowledgeSkills = useMemo(() => {
    const q = knowledgeSearch.toLowerCase().trim();
    return skillsCatalog.filter((s) => {
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q) ||
        (s.instructions || "").toLowerCase().includes(q) ||
        (s.category || "").toLowerCase().includes(q)
      );
    });
  }, [skillsCatalog, knowledgeSearch]);

  const filteredKnowledgeConcepts = useMemo(() => {
    const q = knowledgeSearch.toLowerCase().trim();
    return okfConcepts.filter((c) => {
      if (!q) return true;
      return (
        c.conceptKey.toLowerCase().includes(q) ||
        (c.category || "").toLowerCase().includes(q) ||
        (c.markdownBody || "").toLowerCase().includes(q) ||
        (c.yamlFrontmatter || "").toLowerCase().includes(q)
      );
    });
  }, [okfConcepts, knowledgeSearch]);

  const activeKnowledgeSkillsCount = useMemo(() => {
    return filteredKnowledgeSkills.filter((s) => selectedTools.some((t) => t.name === s.name)).length;
  }, [filteredKnowledgeSkills, selectedTools]);

  const activeKnowledgeConceptsCount = useMemo(() => {
    return filteredKnowledgeConcepts.filter((c) => selectedTools.some((t) => t.name === `okf-${c.conceptKey}`)).length;
  }, [filteredKnowledgeConcepts, selectedTools]);

  const totalFilteredKnowledge = filteredKnowledgeSkills.length + filteredKnowledgeConcepts.length;
  const totalActiveKnowledge = activeKnowledgeSkillsCount + activeKnowledgeConceptsCount;

  const handleBulkToggleKnowledge = (enable: boolean) => {
    if (enable) {
      const newItems: ToolReference[] = [];
      for (const s of filteredKnowledgeSkills) {
        if (!selectedTools.some((t) => t.name === s.name)) {
          newItems.push({
            id: `tool-ref-${crypto.randomUUID()}`,
            name: s.name,
            category: (s.category as any) || "custom",
          });
        }
      }
      for (const c of filteredKnowledgeConcepts) {
        const conceptToolName = `okf-${c.conceptKey}`;
        if (!selectedTools.some((t) => t.name === conceptToolName)) {
          newItems.push({
            id: `tool-ref-${crypto.randomUUID()}`,
            name: conceptToolName,
            category: "native",
          });
        }
      }
      setSelectedTools((prev) => [...prev, ...newItems]);
    } else {
      const skillNames = new Set(filteredKnowledgeSkills.map((s) => s.name));
      const conceptNames = new Set(filteredKnowledgeConcepts.map((c) => `okf-${c.conceptKey}`));
      setSelectedTools((prev) =>
        prev.filter((t) => !skillNames.has(t.name) && !conceptNames.has(t.name))
      );
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

      <div className={`relative w-full ${isDrawerExpanded ? "max-w-5xl sm:max-w-6xl" : "max-w-2xl"} h-full bg-card border-l border-border text-card-foreground shadow-2xl flex flex-col z-10 transition-all duration-300`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-card/60 shrink-0">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-indigo-400" />
            <div>
              <h4 className="text-sm font-bold text-foreground">
                {mode === "standalone_builder" ? "Agent Inspector — Universal Agent Catalog" : "Agent Inspector"}
              </h4>
              <p className="text-[10px] text-muted-foreground">
                {mode === "standalone_builder"
                  ? "Author, configure, and govern standalone agent definitions across all 8 capability tabs"
                  : "Configure identity, tools, knowledge, memory, and guardrails"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
              title={isDrawerExpanded ? "Collapse Inspector Width" : "Expand Inspector Width"}
              className="text-muted-foreground hover:text-foreground p-1.5 hover:bg-muted rounded-xl transition-all flex items-center gap-1 text-[11px] font-bold cursor-pointer"
            >
              {isDrawerExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-xl transition-all cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Enterprise Lock Banner */}
        {isNodeLocked && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Lock className="w-4 h-4 shrink-0" />
              <span className="truncate">Enterprise Locked Agent: Directives and bindings are governed centrally.</span>
            </div>
            <button
              type="button"
              onClick={handleForkAgent}
              className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-[11px] hover:bg-amber-400 transition-all shrink-0 cursor-pointer"
            >
              Detach / Fork
            </button>
          </div>
        )}

        {/* 8-Tab Bar */}
        <div className="flex overflow-x-auto border-b border-border bg-card px-6 shrink-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {(["identity", "tools", "databases", "social", "mcp", "knowledge", "memory", "guardrails"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3.5 px-4 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap -mb-[2px] cursor-pointer ${
                activeTab === tab
                  ? "border-primary text-primary font-bold bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
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
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Agent Name</label>
                  <HelpTooltip content="A human-readable label for this agent node. Used on the canvas, catalog, and in execution logs to identify the agent." side="right" />
                </div>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/30 py-2.5 px-4 text-xs text-foreground outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Agent Description</label>
                  <HelpTooltip content="Brief summary of the agent's purpose, specialization, and execution scope." side="right" />
                </div>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Manages wedding vendor inquiries, quote comparisons, and contract terms"
                  className="w-full rounded-xl border border-border bg-muted/30 py-2.5 px-4 text-xs text-foreground outline-none focus:border-indigo-500"
                />
              </div>

              {roleTemplate === "supervisor" && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Execution Strategy</label>
                    <HelpTooltip content="Decide whether the supervisor should pause and draft a plan first for human approval, or execute directly." side="right" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      onClick={() => setExecutionMode("plan_first")}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        executionMode === "plan_first"
                          ? "bg-indigo-500/10 border-indigo-500/30"
                          : "border-border bg-muted/30 hover:border-border"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        executionMode === "plan_first" ? "border-indigo-500" : "border-slate-600"
                      }`}>
                        {executionMode === "plan_first" && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-foreground block">📋 Plan First</span>
                        <span className="text-[9px] text-muted-foreground">HITL Approval Required</span>
                      </div>
                    </div>
                    <div
                      onClick={() => setExecutionMode("direct")}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        executionMode === "direct"
                          ? "bg-indigo-500/10 border-indigo-500/30"
                          : "border-border bg-muted/30 hover:border-border"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        executionMode === "direct" ? "border-indigo-500" : "border-slate-600"
                      }`}>
                        {executionMode === "direct" && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-foreground block">⚡ Direct Execution</span>
                        <span className="text-[9px] text-muted-foreground">Autonomous Run</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Role Template</label>
                <div className="grid grid-cols-1 gap-2">
                  {ROLE_TEMPLATES.map((rt) => (
                    <div
                      key={rt.value}
                      onClick={() => setRoleTemplate(rt.value)}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        roleTemplate === rt.value
                          ? "bg-indigo-500/10 border-indigo-500/30"
                          : "border-border bg-muted/30 hover:border-border"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        roleTemplate === rt.value ? "border-indigo-500" : "border-slate-600"
                      }`}>
                        {roleTemplate === rt.value && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-foreground block">{rt.label}</span>
                        <span className="text-[9px] text-muted-foreground">{rt.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {roleTemplate !== "supervisor" && roleTemplate !== "team" && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Assigned Team Container</label>
                    <HelpTooltip content="Assign this specialist worker to a visual Team Container to bundle execution into a clean bus pipeline." side="right" />
                  </div>
                  {mode === "standalone_builder" ? (
                    <div className="w-full rounded-xl border border-dashed border-border bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-500 shrink-0" />
                      <span>Standalone / Unassigned (Assigned during flow composition)</span>
                    </div>
                  ) : (
                    <select
                      value={parentId || ""}
                      onChange={(e) => setParentId(e.target.value ? e.target.value : undefined)}
                      className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-indigo-500 font-medium"
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
                  )}
                </div>
              )}

              {/* Enterprise Governance Lock Option */}
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isNodeLocked ? <Lock className="w-4 h-4 text-amber-500" /> : <Unlock className="w-4 h-4 text-muted-foreground" />}
                    <div>
                      <span className="text-xs font-bold text-foreground block">Enterprise Governance Lock</span>
                      <span className="text-[10px] text-muted-foreground">Enforce centralized configuration; prevent flow canvas overrides</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isNodeLocked}
                    onChange={(e) => setIsNodeLocked(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                  />
                </div>
              </div>

              {/* Node Color Theme Swatches */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Node Color & Visual Theme</label>
                  <HelpTooltip content="Customize the visual border, glow, and background tint of this node card for instant identification." side="right" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setCustomColor(preset.id)}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                        customColor === preset.id
                          ? `border-primary ring-2 ${preset.ring} ${preset.bg} text-foreground shadow-xs font-bold`
                          : "border-border hover:border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: preset.dot }} />
                      <span className="truncate text-[11px] font-medium">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">System Directive Prompt</label>
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
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-slate-800/60 hover:bg-slate-700 text-muted-foreground hover:text-foreground text-[9px] font-bold transition-all shrink-0"
                    >
                      <Maximize2 className="h-3 w-3" />
                      Expand
                    </button>
                  </div>
                </div>
                <MarkdownEditor
                  value={systemPrompt}
                  onChange={setSystemPrompt}
                  minHeight="140px"
                  placeholder="Define the agent's role, behavior, and operational constraints..."
                />
              </div>

              {isPromptModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
                  <div className="relative bg-card border border-border text-card-foreground rounded-2xl p-6 max-w-4xl w-full h-[85vh] flex flex-col shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
                      <div className="flex items-center gap-2.5">
                        <Bot className="h-5 w-5 text-indigo-400" />
                        <div>
                          <h3 className="text-sm font-bold text-foreground">System Directive Prompt Editor — {label}</h3>
                          <p className="text-[10px] text-muted-foreground">Edit and refine full system prompt instructions, rules, and guidelines</p>
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
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-slate-800 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col relative min-h-0">
                      <MarkdownEditor
                        value={systemPrompt}
                        onChange={setSystemPrompt}
                        minHeight="480px"
                        placeholder="Define the agent's role, behavior, tools, and operational constraints..."
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2 border-t border-border shrink-0">
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
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">LLM Provider</label>
                  {loadingProviders ? (
                    <div className="flex items-center gap-2 py-2.5 px-4 rounded-xl border border-border bg-background text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading providers...
                    </div>
                  ) : llmProviders.length === 0 ? (
                    <div className="py-2.5 px-4 rounded-xl border border-border bg-background text-xs text-muted-foreground">
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
                      className="w-full rounded-xl border border-border bg-background py-2.5 px-4 text-xs text-foreground outline-none focus:border-indigo-500"
                    >
                      {llmProviders.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Model Version</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background py-2.5 px-4 text-xs text-foreground outline-none focus:border-indigo-500"
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
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Temperature ({temperature})</label>
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
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Native &amp; Custom Tools</span>
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
                        className="w-full rounded-xl border border-border bg-muted py-2 px-3 text-xs text-foreground placeholder-slate-500 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="url"
                        value={customApiUrl}
                        onChange={(e) => setCustomApiUrl(e.target.value)}
                        placeholder="Endpoint webhook URL (https://...)"
                        className="w-full rounded-xl border border-border bg-muted py-2 px-3 text-xs text-foreground placeholder-slate-500 outline-none focus:border-indigo-500"
                      />
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowCustomApiForm(false)}
                          className="px-3 py-1 rounded bg-muted text-muted-foreground hover:text-foreground text-[10px] font-semibold"
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

                {(() => {
                  const nativeToolsList: ToolItem[] = registeredTools
                    .filter((t) => t.category === "native" || t.category === "custom" || t.category === "open")
                    .map((t) => ({
                      name: t.name,
                      category: t.category,
                      description: t.description,
                      status: t.status === "active" ? "active" : "disabled",
                    }));

                  return (
                    <ToolDataTable
                      tools={nativeToolsList}
                      selectedToolKeys={selectedToolKeys}
                      onToggleTool={handleToggleToolItem}
                      onBulkToggle={handleBulkToggleTools}
                      isLoading={loadingRegisteredTools}
                      filterCategories={["all", "native", "custom", "open"]}
                      emptyMessage="No native or custom tools found."
                    />
                  );
                })()}
              </div>
            </div>
          )}

          {/* TAB: EXTERNAL DATABASES */}
          {activeTab === "databases" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">External Database Connectors</span>
                {(() => {
                  const dbToolsList: ToolItem[] = registeredTools
                    .filter((t) => (t.category as string) === "database")
                    .map((t) => ({
                      name: t.name,
                      category: "database",
                      description: t.description,
                      status: t.status === "active" ? "active" : "disabled",
                    }));

                  return (
                    <ToolDataTable
                      tools={dbToolsList}
                      selectedToolKeys={selectedToolKeys}
                      onToggleTool={handleToggleToolItem}
                      onBulkToggle={handleBulkToggleTools}
                      isLoading={loadingRegisteredTools}
                      filterCategories={["all", "database"]}
                      emptyMessage="No external database connections registered. Register them under settings to bind them here."
                    />
                  );
                })()}
              </div>
            </div>
          )}

          {/* TAB: SOCIAL MEDIA */}
          {activeTab === "social" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Social Media Integration Hub</span>
                {(() => {
                  const socialToolsList: ToolItem[] = registeredTools
                    .filter((t) => (t.category as string) === "social_media")
                    .map((t) => ({
                      name: t.name,
                      category: "social_media",
                      description: t.description,
                      status: t.status === "active" ? "active" : "disabled",
                    }));

                  return (
                    <ToolDataTable
                      tools={socialToolsList}
                      selectedToolKeys={selectedToolKeys}
                      onToggleTool={handleToggleToolItem}
                      onBulkToggle={handleBulkToggleTools}
                      isLoading={loadingRegisteredTools}
                      filterCategories={["all", "social_media"]}
                      emptyMessage="No social media connections configured. Configure them under settings to bind them here."
                    />
                  );
                })()}
              </div>
            </div>
          )}

          {/* TAB: MCP SERVERS */}
          {activeTab === "mcp" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">MCP Server Tools</span>
                {mcpServers.length === 0 ? (
                  <div className="flex items-center justify-center py-4 bg-muted/20 border border-border rounded-xl text-muted-foreground text-[10px] gap-2">
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
                      <label className="text-[10px] font-bold text-muted-foreground uppercase shrink-0">Server:</label>
                      <select
                        value={selectedMcpServer}
                        onChange={(e) => setSelectedMcpServer(e.target.value)}
                        className="flex-1 rounded-xl border border-border bg-background py-1.5 px-3 text-xs text-foreground outline-none focus:border-indigo-500"
                      >
                        {mcpServers.map((s) => (
                          <option key={s.serverId} value={s.serverId}>{s.serverId}</option>
                        ))}
                      </select>
                    </div>

                    {(() => {
                      const mcpToolsList: ToolItem[] = currentMcpTools.map((t: any) => ({
                        name: t.name,
                        category: "mcp",
                        serverId: selectedMcpServer,
                        description: t.description,
                        parametersSummary: t.inputSchema?.properties ? Object.keys(t.inputSchema.properties).join(", ") : undefined,
                        status: "active",
                      }));

                      return (
                        <ToolDataTable
                          tools={mcpToolsList}
                          selectedToolKeys={selectedToolKeys}
                          onToggleTool={handleToggleToolItem}
                          onBulkToggle={handleBulkToggleTools}
                          isLoading={loadingMcp}
                          filterCategories={["all", "mcp"]}
                          emptyMessage="No tools discovered on this server."
                        />
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: KNOWLEDGE & RAG */}
          {activeTab === "knowledge" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* RAG & Embedding Model Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-muted/30 border border-border">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-cyan-400" />
                    <label className="block text-xs font-semibold text-foreground uppercase tracking-wider">
                      pgvector RAG Namespace
                    </label>
                    <HelpTooltip
                      content="The vector namespace this agent queries for RAG retrieval. Documents are chunked, embedded, and stored by namespace. Leave as 'default' for shared access."
                      side="right"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Assign a vector namespace the agent can query via RAG retrieval.
                  </p>
                  <input
                    type="text"
                    value={ragNamespace}
                    onChange={(e) => setRagNamespace(e.target.value)}
                    placeholder="e.g. default or corporate-rules"
                    className="w-full rounded-xl border border-border bg-background py-2 px-3.5 text-xs text-foreground outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-400" />
                    <label className="block text-xs font-semibold text-foreground uppercase tracking-wider">
                      Embedding Model
                    </label>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Select a text-embedding model from the active provider&apos;s models for RAG search.
                  </p>
                  <select
                    value={embedModel}
                    onChange={(e) => setEmbedModel(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background py-2 px-3.5 text-xs text-foreground outline-none focus:border-primary transition-colors"
                  >
                    <option value="">No embedding — fallback to text search</option>
                    {(() => {
                      const providerCfg = llmProviders.find((p) => p.id === provider);
                      const providerModels =
                        providerCfg?.models && providerCfg.models.length > 0
                          ? providerCfg.models
                          : providerCfg?.discoveredModels || PROVIDER_MODELS[provider] || [];
                      const embedModels = providerModels.filter((m: string) =>
                        m.toLowerCase().includes("embedding") ||
                        m.toLowerCase().includes("ada") ||
                        m.toLowerCase().includes("text-embed")
                      );
                      return embedModels.map((m: string) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ));
                    })()}
                    {(() => {
                      const providerCfg = llmProviders.find((p) => p.id === provider);
                      const providerModels =
                        providerCfg?.models && providerCfg.models.length > 0
                          ? providerCfg.models
                          : providerCfg?.discoveredModels || PROVIDER_MODELS[provider] || [];
                      return embedModel && !providerModels.some((m: string) => m === embedModel) ? (
                        <option value={embedModel}>{embedModel} (current)</option>
                      ) : null;
                    })()}
                  </select>
                </div>
              </div>

              {/* Header Filter & Bulk Actions Bar */}
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={knowledgeSearch}
                      onChange={(e) => setKnowledgeSearch(e.target.value)}
                      placeholder="Search knowledge skills & OKF concepts by name, key, description..."
                      className="w-full rounded-xl border border-border bg-muted/30 pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAuthoringSkill(!authoringSkill)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" /> Author New Skill
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                  <div>
                    Showing <span className="text-foreground font-semibold">{totalFilteredKnowledge}</span> assets &middot;{" "}
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{totalActiveKnowledge}</span> currently active
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleBulkToggleKnowledge(true)}
                      className="text-[10px] text-primary hover:underline font-bold transition-colors cursor-pointer"
                    >
                      Enable All Filtered
                    </button>
                    <span className="text-border">|</span>
                    <button
                      type="button"
                      onClick={() => handleBulkToggleKnowledge(false)}
                      className="text-[10px] text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer"
                    >
                      Disable All Filtered
                    </button>
                  </div>
                </div>
              </div>

              {/* Inline Custom Skill Authoring Modal/Drawer */}
              {authoringSkill && (
                <div className="border border-border bg-card rounded-2xl p-4 space-y-3 shadow-md animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">Create Local Custom Skill</span>
                    <button
                      type="button"
                      onClick={() => setAuthoringSkill(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    placeholder="Skill name (e.g. format_report)"
                    className="w-full rounded-xl border border-border bg-background py-2 px-3 text-xs text-foreground outline-none focus:border-primary"
                  />
                  <input
                    type="text"
                    value={newSkillDesc}
                    onChange={(e) => setNewSkillDesc(e.target.value)}
                    placeholder="One-sentence description..."
                    className="w-full rounded-xl border border-border bg-background py-2 px-3 text-xs text-foreground outline-none focus:border-primary"
                  />
                  <textarea
                    rows={4}
                    value={newSkillInstructions}
                    onChange={(e) => setNewSkillInstructions(e.target.value)}
                    placeholder="Instructions / procedural guidelines..."
                    className="w-full rounded-xl border border-border bg-background py-2 px-3 text-xs text-foreground font-mono outline-none focus:border-primary"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setAuthoringSkill(false)}
                      className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateSkillInline}
                      disabled={savingSkill}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold"
                    >
                      {savingSkill ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save & Bind"}
                    </button>
                  </div>
                </div>
              )}

              {/* Section 1: Universal Business Skills Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">Universal Business Skills</span>
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border">
                      {skillsCatalog.length} Registered
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/40 overflow-hidden shadow-inner">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs divide-y divide-border/60">
                      <thead className="bg-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center">Toggle</th>
                          <th className="py-2.5 px-3 w-48">Skill &amp; Key</th>
                          <th className="py-2.5 px-3 w-28">Category</th>
                          <th className="py-2.5 px-3">Description &amp; Inputs</th>
                          <th className="py-2.5 px-3 w-24 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {loadingResources && skillsCatalog.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">
                              <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                              Loading skills catalog...
                            </td>
                          </tr>
                        ) : filteredKnowledgeSkills.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs italic">
                              No matching business skills found.
                            </td>
                          </tr>
                        ) : (
                          filteredKnowledgeSkills.map((s) => {
                            const isSkillActive = selectedTools.some((t) => t.name === s.name);
                            return (
                              <tr
                                key={s.id}
                                onClick={() => handleToggleTool(s.name, s.category as any)}
                                className={`hover:bg-muted/40 transition-colors cursor-pointer select-none ${
                                  isSkillActive ? "bg-emerald-500/[0.04]" : ""
                                }`}
                              >
                                <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTool(s.name, s.category as any)}
                                    className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                      isSkillActive ? "bg-emerald-500" : "bg-muted-foreground/30 border border-border"
                                    }`}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                        isSkillActive ? "translate-x-4" : "translate-x-0"
                                      }`}
                                    />
                                  </button>
                                </td>

                                <td className="py-3 px-3">
                                  <div className="font-mono text-xs font-bold text-foreground flex items-center gap-1.5">
                                    <Wrench className="h-3 w-3 text-indigo-500 dark:text-indigo-400 shrink-0" />
                                    <span>{s.name}</span>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                    key: {s.name.toLowerCase().replace(/\s+/g, "_")}
                                  </div>
                                </td>

                                <td className="py-3 px-3">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20">
                                    {s.category || "Custom"}
                                  </span>
                                </td>

                                <td className="py-3 px-3">
                                  <div className="text-muted-foreground text-[11px] leading-relaxed line-clamp-2">
                                    {s.description || "No description provided."}
                                  </div>
                                  {s.instructions && (
                                    <div className="text-[9px] font-mono text-muted-foreground/80 mt-1 truncate">
                                      instructions: {s.instructions.slice(0, 90)}...
                                    </div>
                                  )}
                                </td>

                                <td className="py-3 px-3 text-right">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                      isSkillActive
                                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                        : "bg-muted text-muted-foreground border-border"
                                    }`}
                                  >
                                    {isSkillActive ? (
                                      <>
                                        <Check className="h-2.5 w-2.5" /> Active
                                      </>
                                    ) : (
                                      "Disabled"
                                    )}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Section 2: OKF Concepts Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">OKF v0.1 Concept Bundles</span>
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border">
                      {okfConcepts.length} Available
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/40 overflow-hidden shadow-inner">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs divide-y divide-border/60">
                      <thead className="bg-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center">Toggle</th>
                          <th className="py-2.5 px-3 w-56">Concept &amp; Key</th>
                          <th className="py-2.5 px-3 w-36">Concept Type</th>
                          <th className="py-2.5 px-3">Description &amp; Directives</th>
                          <th className="py-2.5 px-3 w-24 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {loadingResources && okfConcepts.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">
                              <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                              Loading OKF concepts registry...
                            </td>
                          </tr>
                        ) : filteredKnowledgeConcepts.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs italic">
                              No matching OKF concepts found.
                            </td>
                          </tr>
                        ) : (
                          filteredKnowledgeConcepts.map((c) => {
                            const toolPresetName = `okf-${c.conceptKey}`;
                            const isConceptActive = selectedTools.some((t) => t.name === toolPresetName);
                            const excerpt = c.markdownBody
                              ? c.markdownBody.replace(/^#+\s+/gm, "").trim().slice(0, 140)
                              : c.yamlFrontmatter || "Operational knowledge guideline.";
                            return (
                              <tr
                                key={c.id}
                                onClick={() => handleToggleTool(toolPresetName, "native")}
                                className={`hover:bg-muted/40 transition-colors cursor-pointer select-none ${
                                  isConceptActive ? "bg-emerald-500/[0.04]" : ""
                                }`}
                              >
                                <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTool(toolPresetName, "native")}
                                    className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                      isConceptActive ? "bg-emerald-500" : "bg-muted-foreground/30 border border-border"
                                    }`}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                        isConceptActive ? "translate-x-4" : "translate-x-0"
                                      }`}
                                    />
                                  </button>
                                </td>

                                <td className="py-3 px-3">
                                  <div className="font-mono text-xs font-bold text-foreground flex items-center gap-1.5">
                                    <BookOpen className="h-3 w-3 text-cyan-500 dark:text-cyan-400 shrink-0" />
                                    <span>{c.conceptKey}</span>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[200px]">
                                    id: {c.id}
                                  </div>
                                </td>

                                <td className="py-3 px-3">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20">
                                    {c.category}
                                  </span>
                                </td>

                                <td className="py-3 px-3">
                                  <div className="text-muted-foreground text-[11px] leading-relaxed line-clamp-2">
                                    {excerpt}
                                  </div>
                                </td>

                                <td className="py-3 px-3 text-right">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                      isConceptActive
                                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                        : "bg-muted text-muted-foreground border-border"
                                    }`}
                                  >
                                    {isConceptActive ? (
                                      <>
                                        <Check className="h-2.5 w-2.5" /> Active
                                      </>
                                    ) : (
                                      "Disabled"
                                    )}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
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
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Short-Term Memory (Thread Checkpointing)</label>
                  <HelpTooltip content="When enabled, the agent preserves conversation context across turns within the same thread. Disable to force stateless behavior for each interaction." side="right" />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Enables conversational session memory. The agent will remember context from previous turns within the same thread.
                </p>
                <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-muted/30">
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
                  <span className="text-xs text-muted-foreground">
                    {memoryCheckpoint ? "Thread checkpointing enabled" : "Thread checkpointing disabled"}
                  </span>
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-emerald-400" />
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Long-Term Key-Value Persistence</label>
                  <HelpTooltip content="Enables persistent key-value storage across threads. The agent can store and retrieve long-term data using a shared KV namespace." side="right" />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Persist key-value state across threads. The agent can store and retrieve long-term data using a shared KV store.
                </p>
                <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-muted/30">
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
                  <span className="text-xs text-muted-foreground">
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
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">HITL Approval Gate Policy</label>
                  <HelpTooltip content="Human-in-the-Loop (HITL) policy determines when agent actions require manual approval. 'Always Intercept' pauses all runs; 'On Delete' intercepts destructive operations." side="right" />
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Configure safety constraints. When the agent plans an action matching the threshold, execution freezes and requires manual approval.
                </p>
                <select
                  value={hitlPolicy}
                  onChange={(e) => setHitlPolicy(e.target.value as "always" | "on_delete" | "on_mutate" | "never")}
                  className="w-full rounded-xl border border-border bg-background py-2.5 px-4 text-xs text-foreground outline-none focus:border-indigo-500"
                >
                  <option value="always">Always Intercept (Require human sign-off on every run)</option>
                  <option value="on_delete">On Delete Actions (Flag endpoints starting with delete_)</option>
                  <option value="on_mutate">On Mutating Actions (Create, Update, Delete etc.)</option>
                  <option value="never">Auto-approve All (Warning: bypasses safety checks)</option>
                </select>
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-purple-400" />
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">PII Masking Override</label>
                  <HelpTooltip content="Custom regex patterns for PII masking specific to this agent. Patterns are comma-separated. Leave empty to use the system-wide compliance rules defined in Business Center." side="right" />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Custom PII patterns to mask for this agent (comma-separated regex patterns). Leave empty for default masking rules.
                </p>
                <input
                  type="text"
                  value={piiMaskingOverride}
                  onChange={(e) => setPiiMaskingOverride(e.target.value)}
                  placeholder="e.g. \b\d{3}-\d{2}-\d{4}\b, \b[A-Z]{2}\d{6}\b"
                  className="w-full rounded-xl border border-border bg-muted/30 py-2.5 px-4 text-xs text-foreground font-mono outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border bg-background shrink-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-border hover:border-border text-muted-foreground hover:text-foreground text-xs font-semibold transition-all bg-muted/20 cursor-pointer disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/15 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : mode === "standalone_builder" ? (
              "Save to Catalog"
            ) : (
              "Apply Configuration"
            )}
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
