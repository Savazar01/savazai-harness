"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  updateSystemConfig,
  testProviderConnection,
  fetchProviderModels,
  readAgentsMd,
  saveAgentsMd,
  getTelemetryAnalytics,
} from "@/app/admin/settings/actions";
import { SystemConfig, LLMProviderConfig } from "@/components/theme-provider";
import {
  Palette,
  Image as ImageIcon,
  Cpu,
  Wrench,
  Globe,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Plug,
  ShieldCheck,
  Search,
  MapPin,
  Star,
  Mail,
  Send,
  MessageSquare,
  BrainCircuit,
  FileText,
  Plus,
  Trash2,
  HelpCircle,
  BarChart3,

} from "lucide-react";

interface CustomSkill {
  name: string;
  description: string;
  inputSchema: string;
  executableScriptCode: string;
}

interface TelemetryLog {
  createdAt: string;
  provider: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  executionLatencyMs: number;
  spend: number;
}

interface TelemetryStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalReasoningTokens: number;
  totalSpend: number;
  totalRuns: number;
  totalToolCalls: number;
  successfulToolCalls: number;
  successRate: number;
  toolBreakdown: Array<{
    name: string;
    total: number;
    success: number;
    rate: number;
    avgLatencyMs: number;
  }>;
  logs: TelemetryLog[];
}

interface SettingsDashboardProps {
  initialConfig: SystemConfig;
}

type TabType = "appearance" | "branding" | "llm" | "mcp" | "api" | "capability" | "analytics";

const DEFAULT_LLM_PROVIDERS: Record<string, LLMProviderConfig> = {
  openai: { apiKey: "", endpoint: "https://api.openai.com/v1", defaultModel: "gpt-4o", active: false },
  anthropic: { apiKey: "", endpoint: "https://api.anthropic.com", defaultModel: "claude-3-5-sonnet", active: false },
  gemini: { apiKey: "", endpoint: "https://generativelanguage.googleapis.com", defaultModel: "gemini-1.5-pro", active: false },
  openrouter: { apiKey: "", endpoint: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4o", active: false },
  ollama: { apiKey: "", endpoint: "http://localhost:11434", defaultModel: "llama3", active: false },
  lmstudio: { apiKey: "", endpoint: "http://localhost:1234", defaultModel: "qwen2.5-7b", active: false },
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  ollama: "Ollama (Local)",
  lmstudio: "LM Studio (Local)",
};

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: ["claude-3-5-sonnet", "claude-3-5-haiku", "claude-3-opus"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.0-pro"],
  openrouter: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemini-1.5-pro", "meta-llama/llama-3-70b"],
  ollama: ["llama3", "mistral", "qwen2.5", "codellama", "mixtral"],
  lmstudio: ["qwen2.5-7b", "qwen2.5-14b", "llama-3.2-3b", "mistral-nemo"],
};

function TabButton({ tab, icon: Icon, activeTab, setActiveTab, label }: {
  tab: TabType;
  icon: React.FC<{ className?: string }>;
  activeTab: TabType;
  setActiveTab: (t: TabType) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
        activeTab === tab
          ? "bg-primary text-white shadow-lg shadow-primary/20"
          : "text-slate-400 hover:text-white hover:bg-slate-900/40"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

export function SettingsDashboard({ initialConfig }: SettingsDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>("appearance");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; detail?: string; error?: string } | undefined>>({});
  const [dynamicModels, setDynamicModels] = useState<Record<string, string[]>>({});

  const tokens = initialConfig.designTokens || {};
  const storedProviders = React.useMemo(() => tokens.llmProviders || {}, [tokens.llmProviders]);
  const mergedProviders = React.useMemo(() => {
    const res: Record<string, LLMProviderConfig> = {};
    for (const key of Object.keys(DEFAULT_LLM_PROVIDERS)) {
      res[key] = { ...DEFAULT_LLM_PROVIDERS[key], ...(storedProviders[key] || {}) };
    }
    return res;
  }, [storedProviders]);

  React.useEffect(() => {
    Object.entries(mergedProviders).forEach(async ([key, prov]) => {
      if (prov.active && prov.endpoint && prov.apiKey) {
        const res = await fetchProviderModels(key, prov.endpoint, prov.apiKey);
        if (res.success && res.models) {
          setDynamicModels((prev) => ({ ...prev, [key]: res.models }));
        }
      }
    });
  }, [mergedProviders]);

  const [appTitle, setAppTitle] = useState(initialConfig.appTitle);
  const [brandLogoUrl, setBrandLogoUrl] = useState(initialConfig.brandLogoUrl);
  const [primaryColor, setPrimaryColor] = useState(tokens.primaryColor || "#4f46e5");
  const [secondaryColor, setSecondaryColor] = useState(tokens.secondaryColor || "#06b6d4");
  const [background, setBackground] = useState(tokens.background || "#0a0a0a");
  const [fontSans, setFontSans] = useState(tokens.fontSans || "Geist");

  const [llmProviders, setLlmProviders] = useState<Record<string, LLMProviderConfig>>(mergedProviders);

  const [mcpServers, setMcpServers] = useState<string>(tokens.mcpServers || "{}");

  const [tavilyApiKey, setTavilyApiKey] = useState(tokens.tavilyApiKey || "");
  const [serperApiKey, setSerperApiKey] = useState(tokens.serperApiKey || "");
  const [piiRegex, setPiiRegex] = useState(tokens.piiRegex || "");

  const [googlePlacesApiKey, setGooglePlacesApiKey] = useState(tokens.googlePlacesApiKey || "");
  const [googlePlacesRadius, setGooglePlacesRadius] = useState(tokens.googlePlacesRadius || "5000");
  const [yelpClientId, setYelpClientId] = useState(tokens.yelpClientId || "");
  const [yelpApiKey, setYelpApiKey] = useState(tokens.yelpApiKey || "");
  const [gmailClientId, setGmailClientId] = useState(tokens.gmailClientId || "");
  const [gmailClientSecret, setGmailClientSecret] = useState(tokens.gmailClientSecret || "");
  const [gmailRefreshToken, setGmailRefreshToken] = useState(tokens.gmailRefreshToken || tokens.OAUTH_REFRESH_TOKEN || "");
  const [sendgridApiKey, setSendgridApiKey] = useState(tokens.sendgridApiKey || "");
  const [sendgridSenderEmail, setSendgridSenderEmail] = useState(tokens.sendgridSenderEmail || "");
  const [wabaId, setWabaId] = useState(tokens.wabaId || "");
  const [wabaPhoneNumberId, setWabaPhoneNumberId] = useState(tokens.wabaPhoneNumberId || "");
  const [wabaAccessToken, setWabaAccessToken] = useState(tokens.wabaAccessToken || "");

  const [globalSystemPrompt, setGlobalSystemPrompt] = useState(tokens.globalSystemPrompt || "");
  const [orchestrationRules, setOrchestrationRules] = useState(tokens.orchestrationRules || "");
  const [defaultAmbientParameters, setDefaultAmbientParameters] = useState(tokens.defaultAmbientParameters || "");

  const [customSkills, setCustomSkills] = useState<CustomSkill[]>(() => {
    if (tokens.customSkills) {
      if (typeof tokens.customSkills === "string") {
        try {
          return JSON.parse(tokens.customSkills) as CustomSkill[];
        } catch {
          return [];
        }
      }
      return tokens.customSkills as CustomSkill[];
    }
    return [];
  });

  const [agentsMd, setAgentsMd] = useState(tokens.agentsMd || "");
  const [loadingAgentsMd, setLoadingAgentsMd] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<TelemetryStats | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<"date" | "spend">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);
    const res = await getTelemetryAnalytics();
    if (res.success && res.data) {
      setAnalyticsData(res.data as TelemetryStats);
    }
    setLoadingAnalytics(false);
  };

  useEffect(() => {
    if (activeTab === "analytics") {
      const timer = setTimeout(() => {
        fetchAnalytics();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  useEffect(() => {
    const fetchAgentsMd = async () => {
      setLoadingAgentsMd(true);
      const res = await readAgentsMd();
      if (res.success && res.content !== undefined) {
        setAgentsMd(res.content);
      }
      setLoadingAgentsMd(false);
    };
    fetchAgentsMd();
  }, []);

  const uniqueProviders = useMemo(() => {
    if (!analyticsData?.logs) return [];
    const set = new Set<string>();
    analyticsData.logs.forEach((log) => {
      if (log.provider) {
        set.add(log.provider.toLowerCase());
      }
    });
    return Array.from(set).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  }, [analyticsData]);

  const uniqueModels = useMemo(() => {
    if (!analyticsData?.logs) return [];
    const set = new Set<string>();
    analyticsData.logs.forEach((log) => {
      if (log.modelName) {
        set.add(log.modelName);
      }
    });
    return Array.from(set).sort();
  }, [analyticsData]);

  const filteredLogs = useMemo(() => {
    if (!analyticsData?.logs) return [];
    return analyticsData.logs.filter((log) => {
      if (startDate) {
        const start = new Date(startDate);
        const logDate = new Date(log.createdAt);
        if (logDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        const logDate = new Date(log.createdAt);
        if (logDate > end) return false;
      }
      if (selectedProviders.length > 0) {
        if (!selectedProviders.includes(log.provider.toLowerCase())) {
          return false;
        }
      }
      if (selectedModels.length > 0) {
        if (!selectedModels.includes(log.modelName)) {
          return false;
        }
      }
      if (modelSearch) {
        const search = modelSearch.toLowerCase();
        if (!log.modelName.toLowerCase().includes(search)) {
          return false;
        }
      }
      return true;
    });
  }, [analyticsData, startDate, endDate, selectedProviders, selectedModels, modelSearch]);

  const sortedLogs = useMemo(() => {
    const logsCopy = [...filteredLogs];
    return logsCopy.sort((a, b) => {
      let comparison = 0;
      if (sortColumn === "date") {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortColumn === "spend") {
        comparison = a.spend - b.spend;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredLogs, sortColumn, sortDirection]);

  const handleExportCSV = () => {
    if (sortedLogs.length === 0) return;
    const headers = ["Date", "Provider", "Model", "Input Tokens", "Output Tokens", "Reasoning Tokens", "Spend ($)"];
    const rows = sortedLogs.map((log) => [
      new Date(log.createdAt).toLocaleString(),
      log.provider,
      log.modelName,
      log.inputTokens,
      log.outputTokens,
      log.reasoningTokens,
      `$${log.spend.toFixed(5)}`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.map((val) => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `granular_spend_report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const restoreLogoDefault = () => {
    setBrandLogoUrl("https://savazar.com/wp-content/uploads/2023/10/cropped-Transparent_Image_2-300x100.png");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);

    const agentsRes = await saveAgentsMd(agentsMd);
    if (!agentsRes.success) {
      console.warn("Failed to mirror AGENTS.md to filesystem:", agentsRes.error);
    }

    const result = await updateSystemConfig({
      appTitle,
      brandLogoUrl,
      primaryColor,
      secondaryColor,
      background,
      fontSans,
      llmProviders,
      mcpServers,
      tavilyApiKey,
      serperApiKey,
      piiRegex,
      googlePlacesApiKey,
      googlePlacesRadius,
      yelpClientId,
      yelpApiKey,
      gmailClientId,
      gmailClientSecret,
      gmailRefreshToken,
      sendgridApiKey,
      sendgridSenderEmail,
      wabaId,
      wabaPhoneNumberId,
      wabaAccessToken,
      globalSystemPrompt,
      orchestrationRules,
      defaultAmbientParameters,
      customSkills: JSON.stringify(customSkills),
      agentsMd,
    });

    setSaving(false);
    if (result.success) {
      setStatus({ type: "success", message: "Platform settings updated successfully." });
    } else {
      setStatus({ type: "error", message: result.error || "Failed to update platform settings." });
    }
  };

  const updateProvider = useCallback(
    (key: string, field: keyof LLMProviderConfig, value: string | boolean) => {
      setLlmProviders((prev) => ({
        ...prev,
        [key]: { ...prev[key], [field]: value },
      }));
    },
    [],
  );

  const handleTestConnection = useCallback(
    async (key: string) => {
      setTestingProvider(key);
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      const provider = llmProviders[key];
      const result = await testProviderConnection(
        key,
        provider.endpoint,
        provider.apiKey,
        provider.defaultModel,
      );
      setTestResults((prev) => ({ ...prev, [key]: result }));
      setTestingProvider(null);

      if (result.success) {
        const modelsRes = await fetchProviderModels(key, provider.endpoint, provider.apiKey);
        if (modelsRes.success && modelsRes.models) {
          setDynamicModels((prev) => ({ ...prev, [key]: modelsRes.models }));
        }
      }
    },
    [llmProviders],
  );

  const parseMcp = (): Record<string, Record<string, unknown>> => {
    try {
      return JSON.parse(mcpServers) as Record<string, Record<string, unknown>>;
    } catch {
      return {};
    }
  };

  const isValidJson = (str: string) => {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto py-6 px-4 flex flex-col min-h-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-6 border-b border-slate-900 pb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">SavazAI Command Center</h1>
          <p className="text-slate-400 text-sm mt-1">Configure appearance, LLM providers, MCP servers, and API services</p>
        </div>
      </div>

      {status && (
        <div className={`mb-4 flex items-start gap-3 rounded-2xl border p-4 text-sm shrink-0 ${
          status.type === "success"
            ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-400"
            : "border-red-500/25 bg-red-500/5 text-red-400"
        }`}>
          {status.type === "success" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}
          <span>{status.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 min-h-0 flex-1">
        <div className="flex flex-col gap-2 shrink-0">
          <TabButton tab="appearance" icon={Palette} activeTab={activeTab} setActiveTab={setActiveTab} label="Appearance" />
          <TabButton tab="branding" icon={ImageIcon} activeTab={activeTab} setActiveTab={setActiveTab} label="Branding" />
          <TabButton tab="llm" icon={Cpu} activeTab={activeTab} setActiveTab={setActiveTab} label="LLM Providers" />
          <TabButton tab="mcp" icon={Wrench} activeTab={activeTab} setActiveTab={setActiveTab} label="MCP Integration" />
          <TabButton tab="api" icon={Globe} activeTab={activeTab} setActiveTab={setActiveTab} label="API Services" />
          <TabButton tab="capability" icon={BrainCircuit} activeTab={activeTab} setActiveTab={setActiveTab} label="Capability Studio" />
          <TabButton tab="analytics" icon={BarChart3} activeTab={activeTab} setActiveTab={setActiveTab} label="Usage & Spend" />
        </div>

        <form onSubmit={handleSave} className="lg:col-span-3 rounded-3xl border border-slate-900 bg-slate-950/40 p-6 relative flex flex-col min-h-0">
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800 [&::-webkit-scrollbar-thumb]:rounded-full">
            {activeTab === "appearance" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Appearance Overrides</h3>
                  <p className="text-slate-400 text-xs">Custom hex CSS properties, font pairings, and app title banners</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Application Title</label>
                    <input type="text" value={appTitle} onChange={(e) => setAppTitle(e.target.value)} placeholder="SavazAI Console"
                      className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-3 px-4 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Typography Pairing</label>
                    <select value={fontSans} onChange={(e) => setFontSans(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-3 px-4 text-sm text-white outline-none focus:border-primary/50">
                      <option value="Geist">Geist (Modern Sans)</option>
                      <option value="Inter">Inter (SaaS Standard)</option>
                      <option value="Roboto">Roboto (Google Clean)</option>
                      <option value="system-ui">System UI Fallback</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Primary Color (HEX)</label>
                    <div className="flex gap-2">
                      <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-11 w-14 rounded-xl border border-slate-800 bg-slate-900/50 p-1 cursor-pointer" />
                      <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#4f46e5"
                        className="flex-1 rounded-xl border border-slate-800 bg-slate-900/50 py-3 px-4 text-sm text-white" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Secondary Color (HEX)</label>
                    <div className="flex gap-2">
                      <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)}
                        className="h-11 w-14 rounded-xl border border-slate-800 bg-slate-900/50 p-1 cursor-pointer" />
                      <input type="text" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} placeholder="#06b6d4"
                        className="flex-1 rounded-xl border border-slate-800 bg-slate-900/50 py-3 px-4 text-sm text-white" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Background Color</label>
                    <input type="text" value={background} onChange={(e) => setBackground(e.target.value)} placeholder="#0a0a0a"
                      className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-3 px-4 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "branding" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Branding Assets</h3>
                  <p className="text-slate-400 text-xs">Core identity logos with live preview and canonical restoration</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Platform Logo URL</label>
                  <input type="url" value={brandLogoUrl} onChange={(e) => setBrandLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-3 px-4 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20" required />
                </div>
                <div className="flex gap-4 items-center pt-2">
                  <button type="button" onClick={restoreLogoDefault}
                    className="px-4 py-2 border border-slate-800 hover:border-slate-700 bg-slate-900/40 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-all">
                    Restore Canonical Logo
                  </button>
                  {brandLogoUrl && (
                    <div className="rounded-xl border border-slate-900 bg-slate-950 p-2 ml-auto">
                      <img src={brandLogoUrl} alt="Brand preview" className="h-10 max-w-[240px] object-contain brightness-115"
                        onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "llm" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">LLM Providers</h3>
                  <p className="text-slate-400 text-xs">Configure API keys, endpoints, and default models per provider</p>
                </div>





                {Object.entries(PROVIDER_LABELS).map(([key, label]) => {
                  const prov = llmProviders[key] || DEFAULT_LLM_PROVIDERS[key];
                  const testRes = testResults[key];
                  return (
                    <div key={key} className="rounded-2xl border border-slate-900 bg-slate-900/10 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                            prov.active ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-800/50 text-slate-500"
                          }`}>
                            <Cpu className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-white">{label}</span>
                            {prov.active && (
                              <span className="ml-2 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">ACTIVE</span>
                            )}
                          </div>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <span className="text-xs text-slate-500">Enabled</span>
                          <input type="checkbox" checked={prov.active} onChange={(e) => updateProvider(key, "active", e.target.checked)}
                            className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary/30 accent-primary" />
                        </label>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">API Endpoint</label>
                          <input type="text" value={prov.endpoint} onChange={(e) => updateProvider(key, "endpoint", e.target.value)}
                            placeholder={DEFAULT_LLM_PROVIDERS[key].endpoint}
                            className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2 px-3 text-xs text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">API Key</label>
                          <input type="password" value={prov.apiKey} onChange={(e) => updateProvider(key, "apiKey", e.target.value)}
                            placeholder="sk-..."
                            className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2 px-3 text-xs text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Default Model</label>
                          <div className="relative">
                            <input
                              type="text"
                              value={prov.defaultModel}
                              onChange={(e) => updateProvider(key, "defaultModel", e.target.value)}
                              placeholder="model..."
                              list={`models-list-${key}`}
                              className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2 px-3 text-xs text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono"
                            />
                            <datalist id={`models-list-${key}`}>
                              {((dynamicModels[key] && dynamicModels[key].length > 0)
                                ? dynamicModels[key]
                                : (PROVIDER_MODELS[key] || [prov.defaultModel])
                              ).map((m) => (
                                <option key={m} value={m} />
                              ))}
                            </datalist>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => handleTestConnection(key)} disabled={testingProvider === key}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 text-xs font-semibold text-slate-300 hover:text-white transition-all disabled:opacity-50">
                          {testingProvider === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plug className="h-3 w-3" />}
                          Test Connection
                        </button>
                        {testRes ? (
                          <div className={`flex items-center gap-1.5 text-xs ${testRes.success ? "text-emerald-400" : "text-red-400"}`}>
                            {testRes.success ? <><CheckCircle2 className="h-3.5 w-3.5" /> {testRes.detail || "Config Active"}</>
                              : <><XCircle className="h-3.5 w-3.5" /> {testRes.error || "Server Offline"}</>}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === "mcp" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">MCP Integration</h3>
                  <p className="text-slate-400 text-xs">JSON-RPC 2.0 MCP server configurations for tool orchestration</p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">MCP Servers (JSON)</label>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                      isValidJson(mcpServers) ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                    }`}>
                      {isValidJson(mcpServers) ? "Valid JSON" : "Invalid JSON"}
                    </span>
                  </div>
                  <textarea rows={6} value={mcpServers} onChange={(e) => setMcpServers(e.target.value)}
                    placeholder='{"mcpServers":{"playwright":{"command":"npx","args":["@playwright/mcp"],"env":{"KEY":"val"}}}}'
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-3 px-4 text-sm text-white font-mono placeholder-slate-600 outline-none focus:border-primary/50" />
                </div>

                <div className="rounded-xl border border-slate-900 bg-slate-900/10 p-4">
                  <h4 className="text-xs font-bold text-slate-300 mb-3 uppercase tracking-wider">Configured Tool Servers</h4>
                  {(() => {
                    const parsed = parseMcp();
                    const items: [string, Record<string, unknown>][] = parsed.mcpServers
                      ? Object.entries(parsed.mcpServers as Record<string, Record<string, unknown>>)
                      : Object.entries(parsed);
                    if (items.length === 0) return <p className="text-xs text-slate-600">No MCP servers configured yet</p>;
                    return items.map(([name, cfg]) => (
                      <div key={name} className="flex items-center justify-between py-2 border-b border-slate-900 last:border-0">
                        <div>
                          <span className="text-sm font-semibold text-slate-200">{name}</span>
                          <span className="ml-2 text-[10px] text-slate-500 font-mono">
                            {String(cfg.command || "npx")} {Array.isArray(cfg.args) ? (cfg.args as string[]).join(" ") : ""}
                          </span>
                        </div>
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">Active</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {activeTab === "api" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">API Services</h3>
                  <p className="text-slate-400 text-xs">Search indexing, local lookup, communication gateways, and PII regex</p>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Search className="h-4 w-4 text-primary" />
                    Search Engine &amp; Lookup Services
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tavily API Key</label>
                      <input type="password" value={tavilyApiKey} onChange={(e) => setTavilyApiKey(e.target.value)} placeholder="tvly-..."
                        className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                      <p className="mt-1 text-[10px] text-slate-600">Web search & content extraction</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Serper API Key</label>
                      <input type="password" value={serperApiKey} onChange={(e) => setSerperApiKey(e.target.value)} placeholder="serper-..."
                        className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                      <p className="mt-1 text-[10px] text-slate-600">Google search API integration</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Google Places API Key</label>
                      <div className="relative">
                        <input type="password" value={googlePlacesApiKey} onChange={(e) => setGooglePlacesApiKey(e.target.value)} placeholder="AIza..."
                          className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                      </div>
                      <p className="mt-1 text-[10px] text-slate-600">Local business &amp; coordinate resolution</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Search Radius (meters)</label>
                      <input type="number" value={googlePlacesRadius} onChange={(e) => setGooglePlacesRadius(e.target.value)} placeholder="5000"
                        className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Yelp Client ID</label>
                      <div className="relative">
                        <input type="text" value={yelpClientId} onChange={(e) => setYelpClientId(e.target.value)} placeholder="..."
                          className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                        <Star className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Yelp API Key</label>
                      <input type="password" value={yelpApiKey} onChange={(e) => setYelpApiKey(e.target.value)} placeholder="..."
                        className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-900 pt-5">
                  <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-cyan-400" />
                    Communication Gateways
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <p className="text-xs font-bold text-slate-300 mb-3 uppercase tracking-wider">Google Gmail OAuth</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Client ID</label>
                      <input type="text" value={gmailClientId} onChange={(e) => setGmailClientId(e.target.value)} placeholder="..."
                        className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Client Secret</label>
                      <input type="password" value={gmailClientSecret} onChange={(e) => setGmailClientSecret(e.target.value)} placeholder="..."
                        className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Refresh Token</label>
                      <input type="password" value={gmailRefreshToken} onChange={(e) => setGmailRefreshToken(e.target.value)} placeholder="..."
                        className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">SendGrid API Key</label>
                      <div className="relative">
                        <input type="password" value={sendgridApiKey} onChange={(e) => setSendgridApiKey(e.target.value)} placeholder="SG...."
                          className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                        <Send className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Sender Verification Email</label>
                      <input type="email" value={sendgridSenderEmail} onChange={(e) => setSendgridSenderEmail(e.target.value)} placeholder="sender@example.com"
                        className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-900 pt-5">
                  <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-emerald-400" />
                    Enterprise WhatsApp API
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">WABA ID (Business Account ID)</label>
                      <input type="text" value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="..."
                        className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Phone Number ID</label>
                      <input type="text" value={wabaPhoneNumberId} onChange={(e) => setWabaPhoneNumberId(e.target.value)} placeholder="..."
                        className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Permanent System Access Token</label>
                      <input type="password" value={wabaAccessToken} onChange={(e) => setWabaAccessToken(e.target.value)} placeholder="EAA..."
                        className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-900 pt-5">
                  <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    PII Masking Regex Dictionary
                  </h4>
                  <textarea rows={4} value={piiRegex} onChange={(e) => setPiiRegex(e.target.value)}
                    placeholder={`# Email\n[\\w.-]+@[\\w.-]+\\.\\w+\n# Phone\n\\+?\\d{1,3}[-.\\s]?\\(?\\d{1,4}?\\)?[-.\\s]?\\d{1,4}[-.\\s]?\\d{1,9}`}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-3 px-4 text-sm text-white font-mono placeholder-slate-600 outline-none focus:border-primary/50" />
                  <p className="mt-1 text-[10px] text-slate-600">
                    Applied by the Privacy Gateway before any data reaches external LLMs
                  </p>
                </div>
              </div>
            )}

            {activeTab === "capability" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Capability Studio</h3>
                  <p className="text-slate-400 text-xs">Expose dynamic skills registry, Plan-Act loop parameters, and system capability boundaries.</p>
                </div>

                <div className="border-t border-slate-900 pt-5 space-y-4">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-indigo-400" />
                    System Prompt &amp; OKF Matrix Configuration
                  </h4>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Global System Instructions</label>
                    <textarea rows={4} value={globalSystemPrompt} onChange={(e) => setGlobalSystemPrompt(e.target.value)}
                      placeholder="Enter global supervisor system prompts here..."
                      className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-3 px-4 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Orchestration Rules (Plan-Act Loop)</label>
                    <textarea rows={4} value={orchestrationRules} onChange={(e) => setOrchestrationRules(e.target.value)}
                      placeholder="Configure thought-plan-execute loop parameters..."
                      className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-3 px-4 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Default Ambient Parameters</label>
                    <textarea rows={3} value={defaultAmbientParameters} onChange={(e) => setDefaultAmbientParameters(e.target.value)}
                      placeholder="e.g. weddingId: be5badd9-0cb2-4d5d-9acf-2412406b9cae (one parameter per line or JSON format)"
                      className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-3 px-4 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono" />
                  </div>
                </div>

                <div className="border-t border-slate-900 pt-5 space-y-4">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileText className="h-4 w-4 text-cyan-400" />
                    AGENTS.md Blueprint Workspace
                  </h4>
                  <p className="text-slate-400 text-xs">Edit your holistic agent capability boundaries and system rule sets below:</p>
                  {loadingAgentsMd ? (
                    <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading AGENTS.md content...
                    </div>
                  ) : (
                    <textarea rows={10} value={agentsMd} onChange={(e) => setAgentsMd(e.target.value)}
                      placeholder="# CRITICAL RULES..."
                      className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-3 px-4 text-sm text-white font-mono placeholder-slate-600 outline-none focus:border-primary/50" />
                  )}
                </div>

                <div className="border-t border-slate-900 pt-5 space-y-4">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-emerald-400" />
                    Custom Skills Registry
                  </h4>
                  <p className="text-slate-400 text-xs">Register custom Javascript snippets to run executable task logic locally inside the harness.</p>

                  <div className="space-y-4">
                    {customSkills.map((skill, idx) => (
                      <div key={idx} className="border border-slate-900 bg-slate-900/20 rounded-2xl p-4 space-y-3 relative">
                        <button type="button" onClick={() => {
                          const updated = [...customSkills];
                          updated.splice(idx, 1);
                          setCustomSkills(updated);
                        }} className="absolute top-4 right-4 text-red-400 hover:text-red-300 transition-colors p-1" title="Delete custom skill">
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Skill Name</label>
                            <input type="text" value={skill.name} onChange={(e) => {
                              const updated = [...customSkills];
                              updated[idx].name = e.target.value;
                              setCustomSkills(updated);
                            }} placeholder="my_custom_skill" className="w-full rounded-xl border border-slate-800 bg-slate-900/40 py-2 px-3 text-xs text-white" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Description</label>
                            <input type="text" value={skill.description} onChange={(e) => {
                              const updated = [...customSkills];
                              updated[idx].description = e.target.value;
                              setCustomSkills(updated);
                            }} placeholder="Performs a custom action..." className="w-full rounded-xl border border-slate-800 bg-slate-900/40 py-2 px-3 text-xs text-white" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Input Schema (JSON)</label>
                          <textarea rows={3} value={skill.inputSchema} onChange={(e) => {
                            const updated = [...customSkills];
                            updated[idx].inputSchema = e.target.value;
                            setCustomSkills(updated);
                          }} placeholder='{ "type": "object", "properties": { "arg1": { "type": "string" } } }'
                            className="w-full rounded-xl border border-slate-800 bg-slate-900/40 py-2 px-3 text-xs text-white font-mono" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Executable Script Code (Javascript)</label>
                          <textarea rows={5} value={skill.executableScriptCode} onChange={(e) => {
                            const updated = [...customSkills];
                            updated[idx].executableScriptCode = e.target.value;
                            setCustomSkills(updated);
                          }} placeholder='// Access tool arguments via "args" parameter\nconsole.log(args.arg1);\nreturn { success: true, message: `Hello ${args.arg1}` };'
                            className="w-full rounded-xl border border-slate-800 bg-slate-900/40 py-2 px-3 text-xs text-white font-mono" />
                        </div>
                      </div>
                    ))}

                    <button type="button" onClick={() => {
                      setCustomSkills([...customSkills, { name: "", description: "", inputSchema: '{\n  "type": "object",\n  "properties": {}\n}', executableScriptCode: "return { success: true };" }]);
                    }} className="flex items-center gap-1.5 px-4 py-2 border border-dashed border-slate-800 hover:border-slate-700 rounded-xl text-xs text-slate-400 hover:text-slate-200 transition-all bg-slate-950/20">
                      <Plus className="h-3.5 w-3.5" /> Add Custom Skill
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-900 pt-5">
                  <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-4 space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <HelpCircle className="h-4 w-4 text-indigo-400" />
                      Capability Studio Documentation
                    </h4>
                    <ul className="list-disc list-inside text-xs text-slate-500 space-y-1.5 leading-relaxed pl-1">
                      <li><strong>Plan-Act Loop Optimization:</strong> Define rules inside Orchestration Rules to constrain the thought cycles and prevent agent wandering or infinite recursion loops.</li>
                      <li><strong>Declaring Tools:</strong> Document any registered custom skills directly inside the `AGENTS.md` blueprint so that planning sub-agents can reason about and invoke them.</li>
                      <li><strong>Parameter Auto-injection:</strong> Key-value fallback settings defined in Default Ambient Parameters (e.g. `weddingId: your-id`) will be resolved and merged dynamically before any tool executes.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "analytics" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Usage & Spend</h3>
                  <p className="text-slate-400 text-xs">Real-time harness metrics, token usage, spend stats, and tool performance</p>
                </div>

                {loadingAnalytics ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-sm gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span>Analyzing telemetry logs...</span>
                  </div>
                ) : !analyticsData ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    No telemetry log data found. Run chat interactions to collect telemetry logs.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Core Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-5 space-y-1">
                        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Model Runs</span>
                        <div className="text-2xl font-bold text-white font-mono">{analyticsData.totalRuns}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-5 space-y-1">
                        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Accumulated Spend</span>
                        <div className="text-2xl font-bold text-emerald-400 font-mono">${analyticsData.totalSpend.toFixed(5)}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-5 space-y-1">
                        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Tool Success Rate</span>
                        <div className="text-2xl font-bold text-cyan-400 font-mono">{analyticsData.successRate}%</div>
                      </div>
                    </div>

                    {/* Token Breakdown */}
                    <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-5 space-y-4">
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">Token Aggregates</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-slate-400 text-xs">
                        <div className="bg-slate-950/30 rounded-xl p-3">
                          <div className="text-slate-500 mb-0.5 font-semibold">Input Tokens</div>
                          <div className="text-white font-mono font-bold text-sm">{analyticsData.totalInputTokens.toLocaleString()}</div>
                        </div>
                        <div className="bg-slate-950/30 rounded-xl p-3">
                          <div className="text-slate-500 mb-0.5 font-semibold">Output Tokens</div>
                          <div className="text-white font-mono font-bold text-sm">{analyticsData.totalOutputTokens.toLocaleString()}</div>
                        </div>
                        <div className="bg-slate-950/30 rounded-xl p-3">
                          <div className="text-slate-500 mb-0.5 font-semibold">Reasoning Tokens</div>
                          <div className="text-white font-mono font-bold text-sm">{analyticsData.totalReasoningTokens.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>

                    {/* Granular Usage Logs */}
                    <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-5 space-y-4">
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">Granular Usage Logs</h4>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-950/20 border border-slate-900 rounded-xl p-3.5 text-xs">
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Date range picker */}
                          <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-800 rounded-lg px-2.5 py-1.5">
                            <span className="text-slate-500 font-semibold text-[10px] uppercase">Start:</span>
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                              className="bg-transparent text-slate-200 outline-none w-28 text-center font-mono cursor-pointer" />
                            <span className="text-slate-500 font-semibold text-[10px] uppercase ml-1">End:</span>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                              className="bg-transparent text-slate-200 outline-none w-28 text-center font-mono cursor-pointer" />
                          </div>

                          {/* Provider Filter Dropdown */}
                          <div className="relative">
                            <button type="button" onClick={() => setIsProviderDropdownOpen(!isProviderDropdownOpen)}
                              className="flex items-center justify-between gap-2 bg-slate-900/40 border border-slate-800 hover:border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 min-w-[140px] h-[32px] text-left">
                              <span className="truncate">{selectedProviders.length === 0 ? "All Providers" : `${selectedProviders.length} Selected`}</span>
                              <span className="text-slate-500 text-[8px]">▼</span>
                            </button>
                            {isProviderDropdownOpen && (
                              <>
                                <div className="fixed inset-0 z-30" onClick={() => setIsProviderDropdownOpen(false)} />
                                <div className="absolute left-0 mt-2 w-48 rounded-xl border border-slate-800 bg-slate-950 p-2.5 shadow-xl z-40 space-y-1.5">
                                  <div className="text-[10px] uppercase font-bold text-slate-500 px-1.5 pb-1 border-b border-slate-900">Filter Provider</div>
                                  {uniqueProviders.length === 0 ? (
                                    <div className="text-[10px] text-slate-600 px-1.5 py-1">No providers found</div>
                                  ) : (
                                    uniqueProviders.map((prov) => {
                                      const lowProv = prov.toLowerCase();
                                      const isChecked = selectedProviders.includes(lowProv);
                                      return (
                                        <label key={prov} className="flex items-center gap-2 px-1.5 py-1 hover:bg-slate-900 rounded-lg cursor-pointer text-slate-300 select-none">
                                          <input type="checkbox" checked={isChecked} onChange={() => {
                                            if (isChecked) {
                                              setSelectedProviders(selectedProviders.filter((p) => p !== lowProv));
                                            } else {
                                              setSelectedProviders([...selectedProviders, lowProv]);
                                            }
                                          }} className="rounded border-slate-800 text-primary focus:ring-0 bg-slate-900 h-3 w-3" />
                                          {prov}
                                        </label>
                                      );
                                    })
                                  )}
                                  {selectedProviders.length > 0 && (
                                    <button type="button" onClick={() => setSelectedProviders([])}
                                      className="w-full text-center text-[10px] text-primary hover:underline pt-1 border-t border-slate-900 block">
                                      Clear Filter
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>

                          {/* Model Filter Dropdown */}
                          <div className="relative">
                            <button type="button" onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                              className="flex items-center justify-between gap-2 bg-slate-900/40 border border-slate-800 hover:border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 min-w-[140px] h-[32px] text-left">
                              <span className="truncate">{selectedModels.length === 0 ? "All Models" : `${selectedModels.length} Selected`}</span>
                              <span className="text-slate-500 text-[8px]">▼</span>
                            </button>
                            {isModelDropdownOpen && (
                              <>
                                <div className="fixed inset-0 z-30" onClick={() => setIsModelDropdownOpen(false)} />
                                <div className="absolute left-0 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-950 p-2.5 shadow-xl z-40 space-y-1.5 max-h-60 overflow-y-auto">
                                  <div className="text-[10px] uppercase font-bold text-slate-500 px-1.5 pb-1 border-b border-slate-900">Filter Model</div>
                                  {uniqueModels.length === 0 ? (
                                    <div className="text-[10px] text-slate-600 px-1.5 py-1">No models found</div>
                                  ) : (
                                    uniqueModels.map((model) => {
                                      const isChecked = selectedModels.includes(model);
                                      return (
                                        <label key={model} className="flex items-center gap-2 px-1.5 py-1 hover:bg-slate-900 rounded-lg cursor-pointer text-slate-300 select-none text-[11px] font-mono">
                                          <input type="checkbox" checked={isChecked} onChange={() => {
                                            if (isChecked) {
                                              setSelectedModels(selectedModels.filter((m) => m !== model));
                                            } else {
                                              setSelectedModels([...selectedModels, model]);
                                            }
                                          }} className="rounded border-slate-800 text-primary focus:ring-0 bg-slate-900 h-3 w-3" />
                                          <span className="truncate">{model}</span>
                                        </label>
                                      );
                                    })
                                  )}
                                  {selectedModels.length > 0 && (
                                    <button type="button" onClick={() => setSelectedModels([])}
                                      className="w-full text-center text-[10px] text-primary hover:underline pt-1 border-t border-slate-900 block">
                                      Clear Filter
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>

                          {/* Model Search Input */}
                          <div className="relative flex items-center bg-slate-900/40 border border-slate-800 rounded-lg px-2.5 py-1 w-48 h-[32px]">
                            <Search className="h-3 w-3 text-slate-500 mr-1.5 flex-shrink-0" />
                            <input type="text" placeholder="Search model..." value={modelSearch} onChange={(e) => setModelSearch(e.target.value)}
                              className="bg-transparent text-slate-200 placeholder-slate-500 outline-none text-xs w-full font-mono" />
                          </div>
                        </div>

                        {/* CSV Export Button */}
                        <button type="button" onClick={handleExportCSV} disabled={sortedLogs.length === 0}
                          className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-slate-200 px-3.5 py-1.5 shadow-sm transition-all hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed font-semibold h-[32px]">
                          <span>Export to CSV</span>
                        </button>
                      </div>

                      {/* Ledger Table */}
                      <div className="overflow-x-auto border border-slate-900/40 rounded-xl bg-slate-950/20">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-900 text-slate-500 font-semibold uppercase tracking-wider bg-slate-950/40">
                              <th onClick={() => {
                                if (sortColumn === "date") {
                                  setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                                } else {
                                  setSortColumn("date");
                                  setSortDirection("desc");
                                }
                              }} className="py-2.5 px-4 cursor-pointer hover:text-slate-300 select-none font-bold whitespace-nowrap">
                                Date {sortColumn === "date" && (sortDirection === "asc" ? " ▲" : " ▼")}
                              </th>
                              <th className="py-2.5 px-4 font-bold">Provider</th>
                              <th className="py-2.5 px-4 font-bold">Model</th>
                              <th className="py-2.5 px-4 font-bold">Input</th>
                              <th className="py-2.5 px-4 font-bold">Output</th>
                              <th className="py-2.5 px-4 font-bold">Reasoning</th>
                              <th onClick={() => {
                                if (sortColumn === "spend") {
                                  setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                                } else {
                                  setSortColumn("spend");
                                  setSortDirection("desc");
                                }
                              }} className="py-2.5 px-4 cursor-pointer hover:text-slate-300 select-none font-bold text-right whitespace-nowrap">
                                Spend ($) {sortColumn === "spend" && (sortDirection === "asc" ? " ▲" : " ▼")}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900/40 text-slate-300 font-mono">
                            {sortedLogs.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="py-6 text-center text-slate-500 text-xs">
                                  No matching transaction records found.
                                </td>
                              </tr>
                            ) : (
                              sortedLogs.map((log, idx) => (
                                <tr key={idx} className="hover:bg-slate-900/20">
                                  <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                                    {new Date(log.createdAt).toLocaleString()}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap">
                                    <span className="bg-slate-950/40 border border-slate-900 px-2 py-0.5 rounded-md text-[10px] uppercase font-bold text-slate-400">
                                      {log.provider}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4 text-slate-200 max-w-[180px] truncate" title={log.modelName}>
                                    {log.modelName}
                                  </td>
                                  <td className="py-2.5 px-4">{log.inputTokens.toLocaleString()}</td>
                                  <td className="py-2.5 px-4">{log.outputTokens.toLocaleString()}</td>
                                  <td className="py-2.5 px-4">{log.reasoningTokens.toLocaleString()}</td>
                                  <td className="py-2.5 px-4 text-right text-emerald-400 font-bold whitespace-nowrap">
                                    ${log.spend.toFixed(5)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Tool Breakdown Table */}
                    <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-5 space-y-4">
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">Tool Calls breakdown</h4>
                      {analyticsData.toolBreakdown.length === 0 ? (
                        <p className="text-xs text-slate-600">No MCP tool invocations recorded yet</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-slate-900 text-slate-500 font-semibold uppercase tracking-wider">
                                <th className="py-2.5">Tool Name</th>
                                <th className="py-2.5">Total Invocations</th>
                                <th className="py-2.5">Avg Latency</th>
                                <th className="py-2.5">Success Rate</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-900 text-slate-300 font-mono">
                              {analyticsData.toolBreakdown.map((tool, idx) => (
                                <tr key={idx} className="hover:bg-slate-900/20">
                                  <td className="py-2.5 pr-4 text-slate-100 font-semibold">{tool.name}</td>
                                  <td className="py-2.5 pr-4">{tool.total}</td>
                                  <td className="py-2.5 pr-4">{tool.avgLatencyMs}ms</td>
                                  <td className={`py-2.5 ${
                                    tool.rate >= 90 ? "text-emerald-400" : tool.rate >= 70 ? "text-yellow-400" : "text-red-400"
                                  }`}>{tool.rate}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

          {activeTab !== "analytics" && (
            <div className="sticky bottom-0 z-10 bg-[#0c0c12]/95 py-4 border-t border-[#1f1f2e] mt-4 -mx-6 px-6 rounded-b-3xl">
              <div className="flex justify-end">
                <button type="submit"
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary/95 transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={saving}>
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving changes...</> : <><Save className="h-4 w-4" /> Save Configuration</>}
                </button>
              </div>
            </div>
          )}
          </div>
        </form>
      </div>
    </div>
  );
}
