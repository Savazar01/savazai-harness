"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  updateSystemConfig,
  testProviderConnection,
  fetchProviderModels,
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
  BarChart3,
  ExternalLink,
  Database,
  Plus,
  Trash2,
  Edit,
  Share2,
} from "lucide-react";
import { HelpTooltip } from "@/components/shared/help-tooltip";

interface CustomSkill {
  name: string;
  description: string;
  inputSchema: string;
  executableScriptCode: string;
}

interface DbConnection {
  alias: string;
  engine: "postgres" | "mysql" | "mariadb" | "mongodb" | "sqlite" | "oracle";
  hostUri: string;
  port: string;
  database: string;
  user: string;
  passwordKey: string;
  active: boolean;
}

interface SocialConnection {
  name: string;
  preset: string;
  appId: string;
  tokenOrKey: string;
  baseEndpoint: string;
  scopes: string;
  active: boolean;
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

type TabType = "appearance" | "branding" | "llm" | "mcp" | "database" | "api" | "capability" | "analytics" | "social";

const DEFAULT_LLM_PROVIDERS: Record<string, LLMProviderConfig> = {
  openai: { apiKey: "", endpoint: "https://api.openai.com/v1", defaultModel: "gpt-4o", active: false },
  anthropic: { apiKey: "", endpoint: "https://api.anthropic.com", defaultModel: "claude-3-5-sonnet", active: false },
  gemini: { apiKey: "", endpoint: "https://generativelanguage.googleapis.com", defaultModel: "gemini-1.5-pro", active: false },
  groq: { apiKey: "", endpoint: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile", active: false },
  xai: { apiKey: "", endpoint: "https://api.x.ai/v1", defaultModel: "grok-2-1212", active: false },
  omniroute: { apiKey: "", endpoint: "http://localhost:20128/v1", defaultModel: "omniroute-default", active: false },
  openrouter: { apiKey: "", endpoint: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4o", active: false },
  ollama: { apiKey: "", endpoint: "http://localhost:11434", defaultModel: "llama3", active: false },
  lmstudio: { apiKey: "", endpoint: "http://localhost:1234", defaultModel: "qwen2.5-7b", active: false },
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  groq: "Groq",
  xai: "xAI (Grok)",
  omniroute: "OmniRoute AI Gateway",
  openrouter: "OpenRouter",
  ollama: "Ollama (Local)",
  lmstudio: "LM Studio (Local)",
};

const PROVIDER_SETUP_LINKS: Record<string, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/app/apikey",
  groq: "https://console.groq.com/keys",
  xai: "https://console.x.ai",
  omniroute: "http://localhost:20128/v1",
  openrouter: "https://openrouter.ai/keys",
  ollama: "https://ollama.com/download",
  lmstudio: "https://lmstudio.ai/docs/api/server",
};

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: ["claude-3-5-sonnet", "claude-3-5-haiku", "claude-3-opus"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.0-pro"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
  xai: ["grok-2", "grok-2-vision", "grok-beta"],
  omniroute: ["omniroute-default", "meta-llama-3-8b", "gpt-4o-mini"],
  openrouter: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemini-1.5-pro", "meta-llama/llama-3-70b"],
  ollama: ["llama3", "mistral", "qwen2.5", "codellama", "mixtral"],
  lmstudio: ["qwen2.5-7b", "qwen2.5-14b", "llama-3.2-3b", "mistral-nemo"],
};

const MCP_PRESETS: Record<string, { command: string; args: string[]; env: Record<string, string> }> = {
  sap: {
    command: "npx",
    args: ["@savazai/mcp-sap"],
    env: {
      SAP_CLIENT: "100",
      SAP_URL: "https://sap.enterprise.com"
    }
  },
  salesforce: {
    command: "npx",
    args: ["@salesforce/mcp-server"],
    env: {
      SF_USERNAME: "salesforce-integration@company.com",
      SF_PASSWORD: "securePassword123",
      SF_LOGIN_URL: "https://login.salesforce.com"
    }
  },
  servicenow: {
    command: "npx",
    args: ["@servicenow/mcp-connector"],
    env: {
      SNOW_INSTANCE: "companyinstance",
      SNOW_USERNAME: "snow-agent",
      SNOW_PASSWORD: "securePassword123"
    }
  },
  jira: {
    command: "npx",
    args: ["@jira/mcp-bridge"],
    env: {
      JIRA_HOST: "https://company.atlassian.net",
      JIRA_EMAIL: "jira-bot@company.com",
      JIRA_API_TOKEN: "jiraToken"
    }
  },
  slack: {
    command: "npx",
    args: ["@slack/mcp-server"],
    env: {
      SLACK_BOT_TOKEN: "xoxb-slack-bot-token",
      SLACK_APP_TOKEN: "xapp-slack-app-token"
    }
  },
  workday: {
    command: "npx",
    args: ["@workday/mcp-connector"],
    env: {
      WORKDAY_TENANT: "company_tenant",
      WORKDAY_REST_URL: "https://wd3-impl.workday.com"
    }
  }
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
  const tokens = initialConfig.designTokens || {};
  const storedProviders = React.useMemo(() => tokens.llmProviders || {}, [tokens.llmProviders]);
  const mergedProviders = React.useMemo(() => {
    const res: Record<string, LLMProviderConfig> = {};
    for (const key of Object.keys(DEFAULT_LLM_PROVIDERS)) {
      res[key] = { ...DEFAULT_LLM_PROVIDERS[key], ...(storedProviders[key] || {}) };
    }
    return res;
  }, [storedProviders]);

  const [appTitle, setAppTitle] = useState(initialConfig.appTitle);
  const [brandLogoUrl, setBrandLogoUrl] = useState(initialConfig.brandLogoUrl);
  const [primaryColor, setPrimaryColor] = useState(tokens.primaryColor || "#4f46e5");
  const [secondaryColor, setSecondaryColor] = useState(tokens.secondaryColor || "#06b6d4");
  const [background, setBackground] = useState(tokens.background || "#0a0a0a");
  const [fontSans, setFontSans] = useState(tokens.fontSans || "Geist");

  const [llmProviders, setLlmProviders] = useState<Record<string, LLMProviderConfig>>(mergedProviders);
  const [discoveredModels, setDiscoveredModels] = useState<Record<string, string[]>>(() => {
    const initialDiscovered: Record<string, string[]> = {};
    for (const [key, prov] of Object.entries(mergedProviders)) {
      if (prov.discoveredModels) {
        initialDiscovered[key] = prov.discoveredModels;
      }
    }
    return initialDiscovered;
  });

  useEffect(() => {
    const loadAllModelsOnMount = async () => {
      for (const [key, prov] of Object.entries(mergedProviders)) {
        if (prov.active && prov.apiKey) {
          try {
            const res = await fetchProviderModels(key, prov.endpoint, prov.apiKey);
            if (res.success && res.models) {
              setDiscoveredModels((prev) => ({ ...prev, [key]: res.models! }));
              setLlmProviders((prev) => {
                const p = prev[key];
                if (p) {
                  return { ...prev, [key]: { ...p, discoveredModels: res.models! } };
                }
                return prev;
              });
            }
          } catch (e) {
            console.error(`Failed to pre-fetch models for ${key}:`, e);
          }
        }
      }
    };
    loadAllModelsOnMount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getDiscoveredOrFallbackModels = useCallback((key: string): string[] => {
    const live = discoveredModels[key];
    if (live && live.length > 0) {
      return live;
    }
    return PROVIDER_MODELS[key] || [];
  }, [discoveredModels]);

  const [modelInputs, setModelInputs] = useState<Record<string, string>>({});

  const [mcpServers, setMcpServers] = useState<string>(tokens.mcpServers || "{}");

  const injectMcpPreset = useCallback((key: string, presetConfig: Record<string, unknown>) => {
    try {
      let current: Record<string, unknown> = {};
      try {
        current = JSON.parse(mcpServers) as Record<string, unknown>;
      } catch {
        // Start fresh
      }
      if (!current.mcpServers || typeof current.mcpServers !== "object") {
        current.mcpServers = {};
      }
      const mcpMap = current.mcpServers as Record<string, unknown>;
      mcpMap[key] = presetConfig;
      setMcpServers(JSON.stringify(current, null, 2));
      setStatus({ type: "success", message: `Injected preset for ${key}. Save changes to apply.` });
    } catch (err) {
      setStatus({ type: "error", message: `Failed to inject preset: ${String(err)}` });
    }
  }, [mcpServers]);

  const [tavilyApiKey, setTavilyApiKey] = useState(tokens.tavilyApiKey || "");
  const [serperApiKey, setSerperApiKey] = useState(tokens.serperApiKey || "");
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

  const globalSystemPrompt = tokens.globalSystemPrompt || "";
  const orchestrationRules = tokens.orchestrationRules || "";
  const defaultAmbientParameters = tokens.defaultAmbientParameters || "";

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

  const [dbConnections, setDbConnections] = useState<DbConnection[]>(() => {
    if (tokens.dbConnections) {
      if (typeof tokens.dbConnections === "string") {
        try {
          return JSON.parse(tokens.dbConnections) as DbConnection[];
        } catch {
          return [];
        }
      }
      return tokens.dbConnections as DbConnection[];
    }
    return [];
  });

  const [socialConnections, setSocialConnections] = useState<SocialConnection[]>(() => {
    if (tokens.socialConnections) {
      if (typeof tokens.socialConnections === "string") {
        try {
          return JSON.parse(tokens.socialConnections) as SocialConnection[];
        } catch {
          return [];
        }
      }
      return tokens.socialConnections as SocialConnection[];
    }
    return [];
  });

  // Modal and Form States
  const [isAddSocialOpen, setIsAddSocialOpen] = useState(false);
  const [editingSocialIndex, setEditingSocialIndex] = useState<number | null>(null);
  const [newSocialName, setNewSocialName] = useState("");
  const [newSocialPreset, setNewSocialPreset] = useState("youtube");
  const [newSocialAppId, setNewSocialAppId] = useState("");
  const [newSocialTokenOrKey, setNewSocialTokenOrKey] = useState("");
  const [newSocialBaseEndpoint, setNewSocialBaseEndpoint] = useState("");
  const [newSocialScopes, setNewSocialScopes] = useState("");
  const [newSocialActive, setNewSocialActive] = useState(true);
  const [isAddCustomApiOpen, setIsAddCustomApiOpen] = useState(false);
  const [editingApiIndex, setEditingApiIndex] = useState<number | null>(null);
  const [newApiName, setNewApiName] = useState("");
  const [newApiDesc, setNewApiDesc] = useState("");
  const [newApiSchema, setNewApiSchema] = useState("");
  const [newApiCode, setNewApiCode] = useState("");

  const [isAddDbOpen, setIsAddDbOpen] = useState(false);
  const [editingDbIndex, setEditingDbIndex] = useState<number | null>(null);
  const [newDbAlias, setNewDbAlias] = useState("");
  const [newDbEngine, setNewDbEngine] = useState<"postgres" | "mysql" | "mariadb" | "mongodb" | "sqlite" | "oracle">("postgres");
  const [newDbHostUri, setNewDbHostUri] = useState("");
  const [newDbPort, setNewDbPort] = useState("");
  const [newDbDatabase, setNewDbDatabase] = useState("");
  const [newDbUser, setNewDbUser] = useState("");
  const [newDbPasswordKey, setNewDbPasswordKey] = useState("");
  const [newDbActive, setNewDbActive] = useState(true);

  // MCP management
  const [isEditMcpOpen, setIsEditMcpOpen] = useState(false);
  const [editingMcpKey, setEditingMcpKey] = useState<string | null>(null); // null means adding a new server
  const [mcpServerNameInput, setMcpServerNameInput] = useState("");
  const [mcpServerUrlInput, setMcpServerUrlInput] = useState("");
  const [mcpServerActiveInput, setMcpServerActiveInput] = useState(true);

  const agentsMd = tokens.agentsMd || "";
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
    if (editingSocialIndex === null) {
      const timer = setTimeout(() => {
        if (newSocialPreset === "youtube") {
          setNewSocialBaseEndpoint("https://www.googleapis.com/youtube/v3");
          setNewSocialScopes("https://www.googleapis.com/auth/youtube.upload");
        } else if (newSocialPreset === "instagram") {
          setNewSocialBaseEndpoint("https://graph.instagram.com");
          setNewSocialScopes("instagram_basic,instagram_content_publish");
        } else if (newSocialPreset === "facebook") {
          setNewSocialBaseEndpoint("https://graph.facebook.com");
          setNewSocialScopes("pages_manage_posts,publish_to_groups");
        } else if (newSocialPreset === "linkedin") {
          setNewSocialBaseEndpoint("https://api.linkedin.com/v2");
          setNewSocialScopes("w_member_social,r_liteprofile");
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [newSocialPreset, editingSocialIndex]);

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
      dbConnections: JSON.stringify(dbConnections),
      socialConnections: JSON.stringify(socialConnections),
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
    (key: string, field: keyof LLMProviderConfig, value: string | boolean | string[]) => {
      setLlmProviders((prev) => ({
        ...prev,
        [key]: { ...prev[key], [field]: value },
      }));
    },
    [],
  );

  const addModel = useCallback((key: string, model: string) => {
    const trimmed = model.trim();
    if (!trimmed) return;
    setLlmProviders((prev) => {
      const prov = prev[key];
      const current = prov.models || [];
      if (current.includes(trimmed)) return prev;
      return {
        ...prev,
        [key]: { ...prov, models: [...current, trimmed] },
      };
    });
    setModelInputs((prev) => ({ ...prev, [key]: "" }));
  }, []);

  const removeModel = useCallback((key: string, model: string) => {
    setLlmProviders((prev) => {
      const prov = prev[key];
      const current = (prov.models || []).filter((m: string) => m !== model);
      return {
        ...prev,
        [key]: { ...prov, models: current.length > 0 ? current : undefined },
      };
    });
  }, []);

  const toggleModel = useCallback((key: string, model: string, checked: boolean) => {
    setLlmProviders((prev) => {
      const prov = prev[key];
      const current = prov.models || [];
      if (checked) {
        if (current.includes(model)) return prev;
        return { ...prev, [key]: { ...prov, models: [...current, model] } };
      }
      const next = current.filter((m: string) => m !== model);
      return { ...prev, [key]: { ...prov, models: next.length > 0 ? next : undefined } };
    });
  }, []);

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
          setDiscoveredModels((prev) => ({ ...prev, [key]: modelsRes.models! }));
          setLlmProviders((prev) => {
            const prov = prev[key];
            return { ...prev, [key]: { ...prov, discoveredModels: modelsRes.models! } };
          });
        }
      }
    },
    [llmProviders],
  );

  const parseMcp = (): Record<string, Record<string, unknown>> => {
    try {
      const parsed = JSON.parse(mcpServers);
      if (parsed && typeof parsed === "object") {
        if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
          return parsed.mcpServers as Record<string, Record<string, unknown>>;
        }
        return parsed as Record<string, Record<string, unknown>>;
      }
    } catch {}
    return {};
  };

  const toggleMcpActive = (key: string) => {
    try {
      const parsed = parseMcp();
      const server = parsed[key];
      if (server) {
        const currentActive = !(server.active === false || server.disabled === true);
        server.active = !currentActive;
        server.disabled = currentActive;
        const newMcp = { mcpServers: parsed };
        setMcpServers(JSON.stringify(newMcp, null, 2));
        setStatus({ type: "success", message: `Toggled active status for ${key}. Save changes to apply.` });
      }
    } catch (err) {
      setStatus({ type: "error", message: `Failed to toggle status: ${String(err)}` });
    }
  };

  const deleteMcpServer = (key: string) => {
    try {
      const parsed = parseMcp();
      delete parsed[key];
      const newMcp = { mcpServers: parsed };
      setMcpServers(JSON.stringify(newMcp, null, 2));
      setStatus({ type: "success", message: `Removed MCP server ${key}. Save changes to apply.` });
    } catch (err) {
      setStatus({ type: "error", message: `Failed to delete server: ${String(err)}` });
    }
  };

  const openEditMcpModal = (key: string | null) => {
    if (key) {
      const parsed = parseMcp();
      const server = parsed[key];
      if (server) {
        setEditingMcpKey(key);
        setMcpServerNameInput(key);
        const restConfig = { ...server };
        delete restConfig.active;
        delete restConfig.disabled;
        setMcpServerUrlInput(JSON.stringify(restConfig, null, 2));
        setMcpServerActiveInput(!(server.active === false || server.disabled === true));
        setIsEditMcpOpen(true);
      }
    } else {
      setEditingMcpKey(null);
      setMcpServerNameInput("");
      setMcpServerUrlInput(JSON.stringify({
        command: "npx",
        args: ["@modelcontextprotocol/server-everything"],
        env: {}
      }, null, 2));
      setMcpServerActiveInput(true);
      setIsEditMcpOpen(true);
    }
  };

  const handleSaveMcpModal = () => {
    if (!mcpServerNameInput.trim()) {
      setStatus({ type: "error", message: "Server key name is required." });
      return;
    }
    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = JSON.parse(mcpServerUrlInput);
    } catch {
      setStatus({ type: "error", message: "Configuration must be valid JSON." });
      return;
    }

    parsedConfig.active = mcpServerActiveInput;
    parsedConfig.disabled = !mcpServerActiveInput;

    const parsedMcpObj = parseMcp();
    
    if (editingMcpKey && editingMcpKey !== mcpServerNameInput.trim()) {
      delete parsedMcpObj[editingMcpKey];
    }

    parsedMcpObj[mcpServerNameInput.trim()] = parsedConfig;

    const newMcp = { mcpServers: parsedMcpObj };
    setMcpServers(JSON.stringify(newMcp, null, 2));
    setIsEditMcpOpen(false);
    setStatus({ type: "success", message: `MCP server config updated. Save changes to apply.` });
  };

  const handleSaveDbConnection = () => {
    if (!newDbAlias.trim()) {
      setStatus({ type: "error", message: "Alias is required." });
      return;
    }
    const newConn: DbConnection = {
      alias: newDbAlias.trim(),
      engine: newDbEngine,
      hostUri: newDbHostUri.trim(),
      port: newDbPort.trim(),
      database: newDbDatabase.trim(),
      user: newDbUser.trim(),
      passwordKey: newDbPasswordKey.trim(),
      active: newDbActive,
    };
    if (editingDbIndex !== null) {
      setDbConnections((prev) => prev.map((c, i) => i === editingDbIndex ? newConn : c));
      setStatus({ type: "success", message: `Updated connection for ${newDbAlias}. Save changes to apply.` });
    } else {
      setDbConnections((prev) => [...prev, newConn]);
      setStatus({ type: "success", message: `Added connection for ${newDbAlias}. Save changes to apply.` });
    }
    setIsAddDbOpen(false);
    setEditingDbIndex(null);
    setNewDbAlias("");
    setNewDbHostUri("");
    setNewDbPort("");
    setNewDbDatabase("");
    setNewDbUser("");
    setNewDbPasswordKey("");
    setNewDbActive(true);
  };

  const handleEditDbConnection = (index: number) => {
    const conn = dbConnections[index];
    if (conn) {
      setEditingDbIndex(index);
      setNewDbAlias(conn.alias);
      setNewDbEngine(conn.engine);
      setNewDbHostUri(conn.hostUri);
      setNewDbPort(conn.port);
      setNewDbDatabase(conn.database);
      setNewDbUser(conn.user);
      setNewDbPasswordKey(conn.passwordKey);
      setNewDbActive(conn.active);
      setIsAddDbOpen(true);
    }
  };

  const handleDeleteDbConnection = (index: number) => {
    setDbConnections((prev) => prev.filter((_, i) => i !== index));
    setStatus({ type: "success", message: "Database connection removed. Save changes to apply." });
  };

  const handleToggleDbActive = (index: number) => {
    setDbConnections((prev) => prev.map((c, i) => i === index ? { ...c, active: !c.active } : c));
    setStatus({ type: "success", message: "Database connection status toggled. Save changes to apply." });
  };

  const handleSaveSocialConnection = () => {
    if (!newSocialName.trim()) {
      setStatus({ type: "error", message: "Connection name is required." });
      return;
    }
    if (!newSocialTokenOrKey.trim()) {
      setStatus({ type: "error", message: "OAuth Token / API Key is required." });
      return;
    }

    const newConn: SocialConnection = {
      name: newSocialName.trim(),
      preset: newSocialPreset,
      appId: newSocialAppId.trim(),
      tokenOrKey: newSocialTokenOrKey.trim(),
      baseEndpoint: newSocialBaseEndpoint.trim(),
      scopes: newSocialScopes.trim(),
      active: newSocialActive,
    };

    if (editingSocialIndex !== null) {
      setSocialConnections((prev) => prev.map((c, i) => i === editingSocialIndex ? newConn : c));
      setStatus({ type: "success", message: `Updated social connection for ${newSocialName}. Save changes to apply.` });
    } else {
      setSocialConnections((prev) => [...prev, newConn]);
      setStatus({ type: "success", message: `Added social connection for ${newSocialName}. Save changes to apply.` });
    }

    setIsAddSocialOpen(false);
    setEditingSocialIndex(null);
    setNewSocialName("");
    setNewSocialPreset("youtube");
    setNewSocialAppId("");
    setNewSocialTokenOrKey("");
    setNewSocialBaseEndpoint("");
    setNewSocialScopes("");
    setNewSocialActive(true);
  };

  const handleEditSocialConnection = (index: number) => {
    const conn = socialConnections[index];
    if (conn) {
      setEditingSocialIndex(index);
      setNewSocialName(conn.name);
      setNewSocialPreset(conn.preset);
      setNewSocialAppId(conn.appId || "");
      setNewSocialTokenOrKey(conn.tokenOrKey);
      setNewSocialBaseEndpoint(conn.baseEndpoint || "");
      setNewSocialScopes(conn.scopes || "");
      setNewSocialActive(conn.active);
      setIsAddSocialOpen(true);
    }
  };

  const handleDeleteSocialConnection = (index: number) => {
    setSocialConnections((prev) => prev.filter((_, i) => i !== index));
    setStatus({ type: "success", message: "Social connection removed. Save changes to apply." });
  };

  const handleToggleSocialActive = (index: number) => {
    setSocialConnections((prev) => prev.map((c, i) => i === index ? { ...c, active: !c.active } : c));
  };

  const handleSaveCustomApi = () => {
    if (!newApiName.trim()) {
      setStatus({ type: "error", message: "API Name is required." });
      return;
    }
    let parsedSchema = "";
    try {
      if (newApiSchema.trim()) {
        JSON.parse(newApiSchema);
        parsedSchema = newApiSchema;
      } else {
        parsedSchema = JSON.stringify({ type: "object", properties: {} });
      }
    } catch {
      setStatus({ type: "error", message: "Input Schema must be valid JSON." });
      return;
    }

    const newSkill: CustomSkill = {
      name: newApiName.trim().toLowerCase().replace(/\s+/g, "-"),
      description: newApiDesc.trim(),
      inputSchema: parsedSchema,
      executableScriptCode: newApiCode.trim() || "return { status: 'executed' };"
    };

    if (editingApiIndex !== null) {
      setCustomSkills((prev) => prev.map((s, i) => i === editingApiIndex ? newSkill : s));
      setStatus({ type: "success", message: "Dynamic API updated. Save changes to apply." });
    } else {
      setCustomSkills((prev) => [...prev, newSkill]);
      setStatus({ type: "success", message: "Dynamic API added. Save changes to apply." });
    }
    setIsAddCustomApiOpen(false);
    setEditingApiIndex(null);
    setNewApiName("");
    setNewApiDesc("");
    setNewApiSchema("");
    setNewApiCode("");
  };

  const handleEditCustomApi = (index: number) => {
    const skill = customSkills[index];
    if (skill) {
      setEditingApiIndex(index);
      setNewApiName(skill.name);
      setNewApiDesc(skill.description);
      setNewApiSchema(skill.inputSchema);
      setNewApiCode(skill.executableScriptCode);
      setIsAddCustomApiOpen(true);
    }
  };

  const handleDeleteCustomApi = (index: number) => {
    setCustomSkills((prev) => prev.filter((_, i) => i !== index));
    setStatus({ type: "success", message: "Dynamic API removed. Save changes to apply." });
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
          <TabButton tab="database" icon={Database} activeTab={activeTab} setActiveTab={setActiveTab} label="Database Hub" />
          <TabButton tab="api" icon={Globe} activeTab={activeTab} setActiveTab={setActiveTab} label="API Services" />
          <TabButton tab="analytics" icon={BarChart3} activeTab={activeTab} setActiveTab={setActiveTab} label="Usage & Spend" />
          <TabButton tab="social" icon={Share2} activeTab={activeTab} setActiveTab={setActiveTab} label="Social Media Hub" />
        </div>

        <form onSubmit={handleSave} className="lg:col-span-3 rounded-3xl border border-slate-900 bg-slate-950/40 p-6 relative flex flex-col min-h-0">
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800 [&::-webkit-scrollbar-thumb]:rounded-full">
            {activeTab === "appearance" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    Appearance Overrides
                    <HelpTooltip content="Customize the platform look and feel — title, font pairing, and accent colors. Changes apply immediately after saving." side="right" />
                  </h3>
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
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
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    LLM Providers
                    <HelpTooltip content="Configure API keys, endpoints, and default models for each LLM provider. At least one provider must be active with a valid API key for AI features to work." side="right" />
                  </h3>
                  <p className="text-slate-400 text-xs">Configure API keys, endpoints, and default models per provider</p>
                  <div className="mt-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-[10px] text-indigo-300 leading-relaxed space-y-1">
                    <p><strong className="text-indigo-200">How to set up a provider:</strong></p>
                    <ol className="list-decimal list-inside space-y-0.5 text-indigo-300/80">
                      <li>Click the <strong className="text-indigo-200">Setup Guide &amp; Get API Key</strong> link to open the provider&apos;s API key page in a new tab.</li>
                      <li>Sign in / create an account, generate a new API key, and copy it.</li>
                      <li>Paste the key into the <strong className="text-indigo-200">API Key</strong> field below.</li>
                      <li>Toggle <strong className="text-indigo-200">Enabled</strong> on, then click <strong className="text-indigo-200">Test Connection</strong> to verify the key works.</li>
                      <li>Select your preferred <strong className="text-indigo-200">Default Model</strong> and check allowed models for agent workflows.</li>
                    </ol>
                  </div>
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
                        <div className="flex items-center gap-3">
                          {PROVIDER_SETUP_LINKS[key] && (
                            <a
                              href={PROVIDER_SETUP_LINKS[key]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold transition-all"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Setup Guide &amp; Get API Key
                            </a>
                          )}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-xs text-slate-500">Enabled</span>
                            <input type="checkbox" checked={prov.active} onChange={(e) => updateProvider(key, "active", e.target.checked)}
                              className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary/30 accent-primary" />
                          </label>
                        </div>
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
                          <select
                            value={prov.defaultModel}
                            onChange={(e) => updateProvider(key, "defaultModel", e.target.value)}
                            className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2 px-3 text-xs text-white outline-none focus:border-primary/50 font-mono"
                          >
                            {getDiscoveredOrFallbackModels(key).map((m: string) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                            {prov.defaultModel && !getDiscoveredOrFallbackModels(key).includes(prov.defaultModel) && (
                              <option value={prov.defaultModel}>{prov.defaultModel} (current)</option>
                            )}
                          </select>
                        </div>
                      </div>

                      <div className="border-t border-slate-900 pt-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Allowed Models for Agent Workflows</label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const allModels = getDiscoveredOrFallbackModels(key);
                                setLlmProviders((prev) => {
                                  const p = prev[key];
                                  return { ...prev, [key]: { ...p, models: allModels } };
                                });
                              }}
                              className="text-[9px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                            >
                              Select All
                            </button>
                            <span className="text-[9px] text-slate-700">|</span>
                            <button
                              type="button"
                              onClick={() => {
                                setLlmProviders((prev) => {
                                  const p = prev[key];
                                  return { ...prev, [key]: { ...p, models: [] } };
                                });
                              }}
                              className="text-[9px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                            >
                              Deselect All
                            </button>
                          </div>
                        </div>
                        <p className="text-[9px] text-slate-600 -mt-1">Check the models you want available in Studio Agent Inspector. Unchecked models are hidden from the dropdown.</p>

                        {/* Catalog checkboxes */}
                        {getDiscoveredOrFallbackModels(key).length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800">
                            {getDiscoveredOrFallbackModels(key).map((m: string) => {
                              const checked = prov.models ? prov.models.includes(m) : false;
                              return (
                                <label
                                  key={m}
                                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all text-[10px] ${
                                    checked
                                      ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-200"
                                      : "border-slate-800 bg-slate-900/30 text-slate-400 hover:border-slate-700"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => toggleModel(key, m, e.target.checked)}
                                    className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500/30 accent-indigo-500 shrink-0"
                                  />
                                  <span className="font-mono truncate">{m}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        {/* Custom models added that are NOT in the catalog */}
                        {prov.models && prov.models.filter((m: string) => !getDiscoveredOrFallbackModels(key).includes(m)).length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[9px] font-semibold text-slate-500 uppercase">Custom Models</span>
                            <div className="flex flex-wrap gap-1.5">
                              {prov.models.filter((m: string) => !getDiscoveredOrFallbackModels(key).includes(m)).map((m: string) => (
                                <span key={m} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-950/30 border border-amber-500/20 text-[10px] font-mono text-amber-300 group">
                                  {m}
                                  <button
                                    type="button"
                                    onClick={() => removeModel(key, m)}
                                    className="text-amber-500/60 hover:text-red-400 transition-colors"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Add custom model */}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={modelInputs[key] || ""}
                            onChange={(e) => setModelInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addModel(key, modelInputs[key] || ""); } }}
                            placeholder="+ Add custom model ID"
                            className="flex-1 rounded-lg border border-slate-800 bg-slate-900/50 py-1.5 px-3 text-[10px] text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => addModel(key, modelInputs[key] || "")}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold transition-all"
                          >
                            Add
                          </button>
                        </div>

                        {(!prov.models || prov.models.length === 0) && (
                          <p className="text-[10px] text-slate-600 italic">No models selected. All catalog models will be available in Agent Inspector.</p>
                        )}
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
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                      MCP Integration
                      <HelpTooltip content="Model Context Protocol (MCP) servers provide external tools and capabilities to agents. Each server is configured with a command, arguments, and optional environment variables." side="right" />
                    </h3>
                    <p className="text-slate-400 text-xs">JSON-RPC 2.0 MCP server configurations for tool orchestration</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditMcpModal(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/80 transition-all cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Server Instance
                  </button>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Raw JSON Configuration Editor</label>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                      isValidJson(mcpServers) ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                    }`}>
                      {isValidJson(mcpServers) ? "Valid JSON" : "Invalid JSON"}
                    </span>
                  </div>
                  <textarea rows={4} value={mcpServers} onChange={(e) => setMcpServers(e.target.value)}
                    placeholder='{"mcpServers":{"playwright":{"command":"npx","args":["@playwright/mcp"],"env":{"KEY":"val"}}}}'
                    className="w-full rounded-xl border border-slate-800 bg-[#0c0c16] py-2.5 px-3 text-xs text-white font-mono placeholder-slate-600 outline-none focus:border-primary/50" />
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Configured Tool Servers</h4>
                  {(() => {
                    const parsed = parseMcp();
                    const items = Object.entries(parsed);
                    if (items.length === 0) return <p className="text-xs text-slate-600">No MCP servers configured yet</p>;
                    return (
                      <div className="grid grid-cols-1 gap-3">
                        {items.map(([name, cfg]) => {
                          const isActive = !(cfg.active === false || cfg.disabled === true);
                          const envCount = cfg.env ? Object.keys(cfg.env as Record<string, unknown>).length : 0;
                          return (
                            <div key={name} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-slate-900 bg-[#0c0c1b]/60 gap-3 hover:border-slate-800 transition-all">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-white">{name}</span>
                                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${
                                    isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400"
                                  }`}>
                                    {isActive ? "Active" : "Disabled"}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  <span className="text-indigo-400 font-bold">{String(cfg.command || "npx")}</span>
                                  {" "}{Array.isArray(cfg.args) ? (cfg.args as string[]).join(" ") : ""}
                                </div>
                                {envCount > 0 && (
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    Environment variables: <span className="text-cyan-400">{envCount} configured</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <label className="relative inline-flex items-center cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={() => toggleMcpActive(name)}
                                    className="sr-only peer"
                                  />
                                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-white"></div>
                                </label>

                                <button
                                  type="button"
                                  onClick={() => openEditMcpModal(name)}
                                  className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all cursor-pointer"
                                  title="Edit Server"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteMcpServer(name)}
                                  className="p-2 rounded-lg bg-red-950/20 border border-red-900/30 text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-all cursor-pointer"
                                  title="Delete Server"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                <div className="rounded-xl border border-slate-900 bg-slate-900/10 p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Enterprise System Presets</h4>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Click a preset profile below to inject its preconfigured JSON definition directly into your MCP Servers configuration.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(MCP_PRESETS).map(([key, config]) => (
                      <button
                        type="button"
                        key={key}
                        onClick={() => injectMcpPreset(key, config)}
                        className="flex flex-col items-start gap-1 p-3 rounded-xl border border-slate-800 bg-[#0c0c16] text-left hover:border-indigo-500/50 hover:bg-[#0f0f1d] transition-all cursor-pointer"
                      >
                        <span className="text-xs font-bold text-white capitalize">{key}</span>
                        <span className="text-[9px] text-slate-500 font-mono block truncate w-full">
                          {config.args[0]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "database" && (
              <div className="space-y-5">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                      Database Connections Hub
                      <HelpTooltip content="Register external database servers. These databases can be accessed dynamically by agent query tools." side="right" />
                    </h3>
                    <p className="text-slate-400 text-xs">Manage active connections to external database services</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDbIndex(null);
                      setNewDbAlias("");
                      setNewDbEngine("postgres");
                      setNewDbHostUri("");
                      setNewDbPort("5432");
                      setNewDbDatabase("");
                      setNewDbUser("");
                      setNewDbPasswordKey("");
                      setNewDbActive(true);
                      setIsAddDbOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/80 transition-all cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Database Connection
                  </button>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Configured Connections</h4>
                  {dbConnections.length === 0 ? (
                    <div className="text-center py-8 rounded-xl border border-slate-900 bg-slate-950/20 text-slate-500 text-xs">
                      No external database connections registered yet. Click the button above to add one.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {dbConnections.map((conn, index) => (
                        <div key={index} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-slate-900 bg-[#0c0c1b]/60 gap-3 hover:border-slate-800 transition-all">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white">{conn.alias}</span>
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono capitalize ${
                                conn.active ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400"
                              }`}>
                                {conn.engine}
                              </span>
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${
                                conn.active ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400"
                              }`}>
                                {conn.active ? "Active" : "Inactive"}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              Host: <span className="text-slate-300">{conn.hostUri}</span>
                              {conn.port && <>:{conn.port}</>}
                              {conn.database && <>{` (DB: ${conn.database})`}</>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="relative inline-flex items-center cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={conn.active}
                                onChange={() => handleToggleDbActive(index)}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-white"></div>
                            </label>

                            <button
                              type="button"
                              onClick={() => handleEditDbConnection(index)}
                              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all cursor-pointer"
                              title="Edit Connection"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDbConnection(index)}
                              className="p-2 rounded-lg bg-red-950/20 border border-red-900/30 text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-all cursor-pointer"
                              title="Delete Connection"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "api" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    API Services
                    <HelpTooltip content="Configure third-party API services for web search, local business lookup, email (Gmail / SendGrid), WhatsApp messaging, and compliance PII governance." side="right" />
                  </h3>
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
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Plus className="h-4 w-4 text-primary" />
                      Dynamic Integrations &amp; Custom APIs
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingApiIndex(null);
                        setNewApiName("");
                        setNewApiDesc("");
                        setNewApiSchema(JSON.stringify({ type: "object", properties: { to: { type: "string" }, body: { type: "string" } }, required: ["to", "body"] }, null, 2));
                        setNewApiCode(`// Custom API Script execution\n// Receive arguments in \`toolArgs\` variable\nconsole.log("Custom executing with args:", toolArgs);\nreturn { status: "success", received: toolArgs };`);
                        setIsAddCustomApiOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-semibold hover:bg-slate-800 transition-all cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5 text-primary" />
                      Add Custom API
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed mb-4">
                    Register custom API handlers, webhook connectors, and custom JS tasks. Once registered, these endpoints are automatically discovered by orchestrator agents under custom capability nodes.
                  </p>
                  
                  {customSkills.length === 0 ? (
                    <p className="text-xs text-slate-600">No dynamic custom APIs configured yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {customSkills.map((skill, index) => (
                        <div key={index} className="flex items-center justify-between p-3 rounded-xl border border-slate-900 bg-[#070710]/40">
                          <div>
                            <div className="text-xs font-semibold text-slate-200">{skill.name}</div>
                            <div className="text-[10px] text-slate-500">{skill.description || "No description provided."}</div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditCustomApi(index)}
                              className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
                            >
                              <Edit className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomApi(index)}
                              className="p-1.5 rounded bg-red-950/10 border border-red-900/20 text-red-400 hover:bg-red-950/20 transition-all cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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

            {activeTab === "social" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <Share2 className="h-5 w-5 text-indigo-400" />
                    Social Media Integration Hub
                  </h3>
                  <p className="text-slate-400 text-xs">
                    Link social media accounts and configure dynamic API connectors for automated posting and feed sync.
                  </p>
                </div>

                <div className="flex justify-between items-center bg-slate-900/10 border border-slate-900 rounded-2xl p-4">
                  <div className="text-xs text-slate-400">
                    <span className="font-bold text-slate-200 block mb-0.5">Active Social Channels</span>
                    Manage connection credentials and API hooks used by autonomous agents.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSocialIndex(null);
                      setNewSocialName("");
                      setNewSocialPreset("youtube");
                      setNewSocialAppId("");
                      setNewSocialTokenOrKey("");
                      setNewSocialBaseEndpoint("");
                      setNewSocialScopes("");
                      setNewSocialActive(true);
                      setIsAddSocialOpen(true);
                    }}
                    className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 shadow-md shadow-indigo-600/10 transition-all hover:scale-[1.01]"
                  >
                    <Plus className="h-4 w-4" /> Add Social Channel
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {socialConnections.length === 0 ? (
                    <div className="col-span-2 rounded-2xl border border-dashed border-slate-800 bg-slate-950/20 p-8 text-center text-slate-500 text-xs space-y-2">
                      <p>No social media integrations connected yet.</p>
                      <p className="text-[10px] text-slate-600">Connect a channel to expose tools like posting and analytics to agent graph workflows.</p>
                    </div>
                  ) : (
                    socialConnections.map((conn, idx) => (
                      <div
                        key={idx}
                        className={`rounded-2xl border bg-slate-950/20 p-4 space-y-3 transition-all ${
                          conn.active ? "border-slate-800" : "border-slate-950 opacity-60"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">{conn.name}</span>
                              <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-[8px] uppercase font-bold text-slate-400">
                                {conn.preset}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono mt-0.5 block truncate max-w-[200px]">
                              API endpoint: {conn.baseEndpoint || "None"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleToggleSocialActive(idx)}
                              className={`px-2 py-1 rounded-lg border text-[10px] font-bold uppercase transition-all ${
                                conn.active
                                  ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10"
                                  : "border-slate-800 text-slate-400 bg-slate-900/40 hover:bg-slate-800"
                              }`}
                            >
                              {conn.active ? "Active" : "Disabled"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditSocialConnection(idx)}
                              className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-900 rounded-lg transition-all"
                              title="Edit Credentials"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSocialConnection(idx)}
                              className="text-red-400 hover:text-red-300 p-1.5 hover:bg-red-500/5 rounded-lg transition-all"
                              title="Delete Integration"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-900 text-[10px]">
                          <div>
                            <span className="text-slate-500 block">App ID / Client Key</span>
                            <span className="text-slate-300 font-mono truncate block">{conn.appId || "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">API Secret / OAuth Token</span>
                            <span className="text-slate-300 font-mono block">••••••••••••••••</span>
                          </div>
                        </div>

                        {conn.scopes && (
                          <div className="bg-slate-900/40 border border-slate-900 rounded-lg p-2 text-[9px] font-mono text-slate-400">
                            <span className="font-bold text-slate-500 block uppercase tracking-wider mb-0.5">Granted Scopes</span>
                            {conn.scopes}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
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

      {/* ── Modal: Add / Edit MCP Server Instance ── */}
      {isEditMcpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#0f0f1d] border border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">
                {editingMcpKey ? "Edit MCP Server" : "Add MCP Server Instance"}
              </h3>
              <p className="text-slate-400 text-xs">Configure a dynamic Model Context Protocol connector profile.</p>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Server Key Name</label>
                <input
                  type="text"
                  value={mcpServerNameInput}
                  onChange={(e) => setMcpServerNameInput(e.target.value)}
                  placeholder="e.g. sap-prod"
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-sm text-white outline-none focus:border-primary/50 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">JSON Configuration Settings</label>
                <textarea
                  rows={6}
                  value={mcpServerUrlInput}
                  onChange={(e) => setMcpServerUrlInput(e.target.value)}
                  placeholder={`{\n  "command": "npx",\n  "args": ["@modelcontextprotocol/server-postgres"],\n  "env": {\n    "DATABASE_URL": "postgresql://..."\n  }\n}`}
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2.5 px-3 text-xs text-white font-mono outline-none focus:border-primary/50"
                />
              </div>

              <div className="flex items-center justify-between py-2 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-300">Active Status Enabled</span>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={mcpServerActiveInput}
                    onChange={(e) => setMcpServerActiveInput(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-white"></div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsEditMcpOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveMcpModal}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/95 text-white text-xs font-semibold transition-all cursor-pointer"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add / Edit Database Connection ── */}
      {isAddDbOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#0f0f1d] border border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">
                {editingDbIndex !== null ? "Edit Database Connection" : "Add Database Connection"}
              </h3>
              <p className="text-slate-400 text-xs">Configure connection variables to register an external database.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Connection Alias</label>
                <input
                  type="text"
                  value={newDbAlias}
                  onChange={(e) => setNewDbAlias(e.target.value)}
                  placeholder="e.g. sap-db-dev"
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Engine Type</label>
                <select
                  value={newDbEngine}
                  onChange={(e) => setNewDbEngine(e.target.value as "postgres" | "mysql" | "mariadb" | "mongodb" | "sqlite" | "oracle")}
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50"
                >
                  <option value="postgres">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="mariadb">MariaDB</option>
                  <option value="mongodb">MongoDB</option>
                  <option value="sqlite">SQLite</option>
                  <option value="oracle">Oracle</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Host / Connection URI</label>
                <input
                  type="text"
                  value={newDbHostUri}
                  onChange={(e) => setNewDbHostUri(e.target.value)}
                  placeholder={newDbEngine === "sqlite" ? "/path/to/database.sqlite" : "mongodb://... or host ip"}
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50 font-mono"
                />
              </div>

              {newDbEngine !== "sqlite" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Port</label>
                    <input
                      type="text"
                      value={newDbPort}
                      onChange={(e) => setNewDbPort(e.target.value)}
                      placeholder="e.g. 5432"
                      className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Database Name</label>
                    <input
                      type="text"
                      value={newDbDatabase}
                      onChange={(e) => setNewDbDatabase(e.target.value)}
                      placeholder="e.g. users_db"
                      className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">User / Role</label>
                    <input
                      type="text"
                      value={newDbUser}
                      onChange={(e) => setNewDbUser(e.target.value)}
                      placeholder="username"
                      className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password / Key</label>
                    <input
                      type="password"
                      value={newDbPasswordKey}
                      onChange={(e) => setNewDbPasswordKey(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50 font-mono"
                    />
                  </div>
                </>
              )}

              <div className="md:col-span-2 flex items-center justify-between py-2 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-300">Active Connection Switch</span>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newDbActive}
                    onChange={(e) => setNewDbActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-white"></div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsAddDbOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDbConnection}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/95 text-white text-xs font-semibold transition-all cursor-pointer"
              >
                Apply Connection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add / Edit Dynamic Custom API ── */}
      {isAddCustomApiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#0f0f1d] border border-slate-800 rounded-3xl p-6 max-w-xl w-full space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">
                {editingApiIndex !== null ? "Edit Custom API" : "Add Dynamic Custom API"}
              </h3>
              <p className="text-slate-400 text-xs">Define a custom JavaScript script execution block to register a dynamic native tool.</p>
            </div>

            <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">API Name (hyphenated-only)</label>
                <input
                  type="text"
                  value={newApiName}
                  onChange={(e) => setNewApiName(e.target.value)}
                  placeholder="e.g. send-customer-sms"
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Description</label>
                <input
                  type="text"
                  value={newApiDesc}
                  onChange={(e) => setNewApiDesc(e.target.value)}
                  placeholder="Explain what this dynamic integration accomplishes"
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Arguments JSON Schema</label>
                <textarea
                  rows={4}
                  value={newApiSchema}
                  onChange={(e) => setNewApiSchema(e.target.value)}
                  placeholder={`{\n  "type": "object",\n  "properties": {\n    "param1": { "type": "string" }\n  },\n  "required": ["param1"]\n}`}
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white font-mono outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">JavaScript Execution Script Code</label>
                <textarea
                  rows={6}
                  value={newApiCode}
                  onChange={(e) => setNewApiCode(e.target.value)}
                  placeholder={`// Execute custom API tasks\n// Received parameters: toolArgs\nconsole.log(toolArgs);\nreturn { status: "completed" };`}
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2.5 px-3 text-xs text-white font-mono outline-none focus:border-primary/50"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsAddCustomApiOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCustomApi}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/95 text-white text-xs font-semibold transition-all cursor-pointer"
              >
                Apply Integration
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Modal: Add / Edit Social Connection ── */}
      {isAddSocialOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#0f0f1d] border border-slate-800 rounded-3xl p-6 max-w-xl w-full space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div>
              <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <Share2 className="h-5 w-5 text-indigo-400" />
                {editingSocialIndex !== null ? "Edit Social Connection" : "Add Social Connection"}
              </h3>
              <p className="text-slate-400 text-xs">Configure OAuth or API keys for a dynamic social media publisher channel.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Connection Name</label>
                <input
                  type="text"
                  value={newSocialName}
                  onChange={(e) => setNewSocialName(e.target.value)}
                  placeholder="e.g. My Marketing Channel"
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Channel Type / Preset</label>
                <select
                  value={newSocialPreset}
                  onChange={(e) => setNewSocialPreset(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50"
                >
                  <option value="youtube">YouTube preset</option>
                  <option value="instagram">Instagram preset</option>
                  <option value="facebook">Facebook preset</option>
                  <option value="linkedin">LinkedIn preset</option>
                  <option value="tiktok">TikTok preset</option>
                  <option value="x">X (Twitter) preset</option>
                  <option value="pinterest">Pinterest preset</option>
                  <option value="custom">Custom integration</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">App ID / Client ID (Optional)</label>
                <input
                  type="text"
                  value={newSocialAppId}
                  onChange={(e) => setNewSocialAppId(e.target.value)}
                  placeholder="e.g. cli-928374928"
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">OAuth Token / API Key</label>
                <input
                  type="password"
                  value={newSocialTokenOrKey}
                  onChange={(e) => setNewSocialTokenOrKey(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50 font-mono"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Base Endpoint URL</label>
                <input
                  type="text"
                  value={newSocialBaseEndpoint}
                  onChange={(e) => setNewSocialBaseEndpoint(e.target.value)}
                  placeholder="e.g. https://api.twitter.com/2"
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50 font-mono"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">OAuth Scopes (Comma or space separated)</label>
                <input
                  type="text"
                  value={newSocialScopes}
                  onChange={(e) => setNewSocialScopes(e.target.value)}
                  placeholder="e.g. tweet.read, tweet.write"
                  className="w-full rounded-xl border border-slate-800 bg-[#070710] py-2 px-3 text-xs text-white outline-none focus:border-primary/50 font-mono"
                />
              </div>

              <div className="md:col-span-2 flex items-center justify-between py-2 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-300">Active Toggle Switch</span>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newSocialActive}
                    onChange={(e) => setNewSocialActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-white"></div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsAddSocialOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSocialConnection}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/95 text-white text-xs font-semibold transition-all cursor-pointer"
              >
                Apply Integration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
