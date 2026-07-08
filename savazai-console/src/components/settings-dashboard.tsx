"use client";

import React, { useState, useCallback } from "react";
import { updateSystemConfig, testProviderConnection, fetchProviderModels } from "@/app/admin/settings/actions";
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
} from "lucide-react";

interface SettingsDashboardProps {
  initialConfig: SystemConfig;
}

type TabType = "appearance" | "branding" | "llm" | "mcp" | "api";

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
  const [gmailRedirectUri, setGmailRedirectUri] = useState(tokens.gmailRedirectUri || "");
  const [sendgridApiKey, setSendgridApiKey] = useState(tokens.sendgridApiKey || "");
  const [sendgridSenderEmail, setSendgridSenderEmail] = useState(tokens.sendgridSenderEmail || "");
  const [wabaId, setWabaId] = useState(tokens.wabaId || "");
  const [wabaPhoneNumberId, setWabaPhoneNumberId] = useState(tokens.wabaPhoneNumberId || "");
  const [wabaAccessToken, setWabaAccessToken] = useState(tokens.wabaAccessToken || "");

  const restoreLogoDefault = () => {
    setBrandLogoUrl("https://savazar.com/wp-content/uploads/2023/10/cropped-Transparent_Image_2-300x100.png");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);

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
      gmailRedirectUri,
      sendgridApiKey,
      sendgridSenderEmail,
      wabaId,
      wabaPhoneNumberId,
      wabaAccessToken,
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
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Authorized Redirect URI</label>
                      <input type="url" value={gmailRedirectUri} onChange={(e) => setGmailRedirectUri(e.target.value)} placeholder="https://yourdomain.com/api/auth/gmail/callback"
                        className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-primary/50" />
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
          </div>

          <div className="sticky bottom-0 z-10 bg-[#0c0c12]/95 py-4 border-t border-[#1f1f2e] mt-4 -mx-6 px-6 rounded-b-3xl">
            <div className="flex justify-end">
              <button type="submit"
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary/95 transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving changes...</> : <><Save className="h-4 w-4" /> Save Configuration</>}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
