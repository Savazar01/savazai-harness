"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Users,
  Sliders,
  Briefcase,
  Workflow,
  Activity,
  FileCode,
  Terminal,
  Search,
  Download,
  RefreshCw,
  GitCompare,
  Code,
  ChevronLeft,
  ChevronRight,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  BarChart3,
  Bell,
  Plus,
  Trash2,
  Mail,
  Zap,
  TrendingUp,
  Layers,
  ArrowRight,
  Send,
  Eye,
} from "lucide-react";
import { DiffViewerModal } from "./diff-viewer-modal";

type TabKey =
  | "overview"
  | "alerting"
  | "user_admin"
  | "command_center"
  | "business_center"
  | "agentflows"
  | "agents_activity"
  | "asset_revisions"
  | "prompt_revisions";

interface AuditRecord {
  id: string;
  category?: string;
  action?: string;
  resource?: string;
  targetId?: string;
  targetName?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  actorId?: string;
  actorEmail?: string;
  createdAt: string;
  // telemetry specific
  chatId?: string;
  provider?: string;
  modelName?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  executionLatencyMs?: number;
  executedMcpTools?: any[];
  transactionCost?: number;
  // asset revision specific
  assetType?: string;
  assetKey?: string;
  version?: string;
  content?: string;
  metadataSnapshot?: Record<string, any>;
  authorId?: string;
  authorEmail?: string;
  changeSummary?: string;
  // prompt revision specific
  agentId?: string;
  agentName?: string;
  agentRole?: string;
  agentflowId?: string;
  agentflowTitle?: string;
  versionNumber?: number;
  systemPrompt?: string;
  promptLengthChars?: number;
}

interface OverviewData {
  totalEvents: number;
  total24h: number;
  total7d: number;
  criticalMutations: number;
  activeTelemetry: number;
  promptRevisions: number;
  categoryBreakdown: { category: string; count: number }[];
  topActors: { email: string; count: number }[];
  recentMutations: AuditRecord[];
}

interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  eventPattern: string;
  severityThreshold: "all" | "critical" | "warning";
  recipientEmails: string[];
  createdAt: string;
}

export const REPORT_CATEGORIES = [
  {
    title: "Analytics & Controls",
    items: [
      { id: "overview" as TabKey, label: "Overview Dashboard", icon: BarChart3, desc: "Operational KPIs, mutation timelines & model telemetry" },
      { id: "alerting" as TabKey, label: "Alerting Rules", icon: Bell, desc: "Automated thresholds & security notification rules" },
    ],
  },
  {
    title: "Operational Audit Ledgers",
    items: [
      { id: "user_admin" as TabKey, label: "User Admin", icon: Users, desc: "RBAC modifications, user status changes & invites" },
      { id: "command_center" as TabKey, label: "Command Center", icon: Sliders, desc: "LLM providers, MCP registrations & system keys" },
      { id: "business_center" as TabKey, label: "Business Center", icon: Briefcase, desc: "Skills catalog, OKF rulesets & compliance specs" },
      { id: "agentflows" as TabKey, label: "Agentflows", icon: Workflow, desc: "Studio canvas deployments & execution graphs" },
      { id: "agents_activity" as TabKey, label: "Agents Telemetry", icon: Activity, desc: "Token consumption, latency & tool invocation traces" },
    ],
  },
  {
    title: "Asset Version Control",
    items: [
      { id: "asset_revisions" as TabKey, label: "Skills & OKF Versions", icon: FileCode, desc: "Historical diffs for business skills and SOP bundles" },
      { id: "prompt_revisions" as TabKey, label: "System Prompt Versions", icon: Terminal, desc: "Version tracking and line-by-line prompt diffs" },
    ],
  },
];

export function GovernanceDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<AuditRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Overview dashboard state
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [overviewRange, setOverviewRange] = useState<1 | 7 | 30>(7);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // Alerting state
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);
  const [alertName, setAlertName] = useState("");
  const [alertPattern, setAlertPattern] = useState("");
  const [alertSeverity, setAlertSeverity] = useState<"all" | "critical" | "warning">("warning");
  const [alertEmails, setAlertEmails] = useState("");
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [testAlertSending, setTestAlertSending] = useState<string | null>(null);
  const [alertFeedback, setAlertFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // JSON / Visual Diff viewer modal
  const [jsonModalRecord, setJsonModalRecord] = useState<AuditRecord | null>(null);
  const [modalViewMode, setModalViewMode] = useState<"diff" | "json">("diff");

  // Diff viewer modal for assets / prompts
  const [diffState, setDiffState] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    badgeLabel?: string;
    oldVersionLabel: string;
    newVersionLabel: string;
    oldContent: string;
    newContent: string;
    authorEmail?: string;
    timestamp?: string;
  }>({
    isOpen: false,
    title: "",
    oldVersionLabel: "",
    newVersionLabel: "",
    oldContent: "",
    newContent: "",
  });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch overview data
  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await fetch(`/api/governance/audit?tab=overview&days=${overviewRange}`);
      if (res.ok) {
        const data = await res.json();
        setOverviewData(data.overview || null);
      }
    } catch (err) {
      console.error("[GovernanceDashboard] Overview fetch failed:", err);
    } finally {
      setOverviewLoading(false);
    }
  }, [overviewRange]);

  // Fetch alert rules
  const fetchAlertRules = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await fetch("/api/governance/alerts");
      if (res.ok) {
        const data = await res.json();
        setAlertRules(data.rules || []);
      }
    } catch (err) {
      console.error("[GovernanceDashboard] Alert rules fetch failed:", err);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  // Fetch ledger data
  const fetchData = useCallback(async () => {
    if (activeTab === "overview") {
      fetchOverview();
      return;
    }
    if (activeTab === "alerting") {
      fetchAlertRules();
      return;
    }

    setLoading(true);
    try {
      const offset = (page - 1) * pageSize;
      const params = new URLSearchParams({
        tab: activeTab,
        search: debouncedSearch,
        limit: String(pageSize),
        offset: String(offset),
      });

      const res = await fetch(`/api/governance/audit?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("[GovernanceDashboard] Fetch failed:", err);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedSearch, page, fetchOverview, fetchAlertRules]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Tab Switch
  const handleTabChange = (val: string) => {
    setActiveTab(val as TabKey);
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
  };

  // Open diff for asset or prompt revision
  const handleOpenDiff = async (record: AuditRecord, type: "asset" | "prompt") => {
    try {
      const res = await fetch(
        `/api/governance/audit?action=compare&type=${type}&id=${record.id}`
      );
      if (!res.ok) throw new Error("Failed to load revision comparison");
      const data = await res.json();
      const current = data.current;
      const previous = data.previous;

      if (type === "prompt") {
        setDiffState({
          isOpen: true,
          title: `Agent Directive Diff: ${current.agent_name || current.agentId || current.agent_id || "Agent"}`,
          subtitle: `${current.agentflow_title || current.agentflowTitle ? `Flow: ${current.agentflow_title || current.agentflowTitle}` : `Flow ID: ${current.agentflow_id || current.agentflowId}`} • Role: ${current.agent_role || current.agentRole || "Agent"}`,
          badgeLabel: "System Prompt",
          oldVersionLabel: previous ? `v${previous.version_number ?? previous.versionNumber}` : "Initial Baseline (v0)",
          newVersionLabel: `v${current.version_number ?? current.versionNumber}`,
          oldContent: previous ? (previous.system_prompt ?? previous.systemPrompt ?? "") : "",
          newContent: current.system_prompt ?? current.systemPrompt ?? "",
          authorEmail: current.author_email || current.authorEmail,
          timestamp: current.created_at || current.createdAt,
        });
      } else {
        setDiffState({
          isOpen: true,
          title: `Asset Revision Diff: ${current.asset_key}`,
          subtitle: `${current.asset_type?.toUpperCase()} • ${current.change_summary || "Revision comparison"}`,
          badgeLabel: current.asset_type,
          oldVersionLabel: previous ? previous.version : "Initial Baseline",
          newVersionLabel: current.version,
          oldContent: previous ? previous.content : "",
          newContent: current.content,
          authorEmail: current.author_email,
          timestamp: current.created_at,
        });
      }
    } catch (err) {
      console.error("[handleOpenDiff] Error:", err);
    }
  };

  // Export to CSV
  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams({
        tab: activeTab === "overview" || activeTab === "alerting" ? "command_center" : activeTab,
        search: debouncedSearch,
        limit: "500",
        offset: "0",
      });
      const res = await fetch(`/api/governance/audit?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to export data");
      const data = await res.json();
      const exportItems: AuditRecord[] = data.items || [];

      if (exportItems.length === 0) {
        alert("No records to export.");
        return;
      }

      const headers = Object.keys(exportItems[0]).filter(
        (k) => k !== "content" && k !== "systemPrompt"
      );
      const csvRows = [
        headers.join(","),
        ...exportItems.map((row) =>
          headers
            .map((field) => {
              const val = (row as any)[field];
              if (val === undefined || val === null) return '""';
              if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
              return `"${String(val).replace(/"/g, '""')}"`;
            })
            .join(",")
        ),
      ];

      const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `governance_audit_${activeTab}_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("[handleExportCsv] Error:", err);
    }
  };

  // Toggle Alert Rule Enable / Disable
  const handleToggleAlertRule = async (rule: AlertRule) => {
    try {
      const res = await fetch("/api/governance/alerts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      if (res.ok) {
        setAlertRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
        );
      }
    } catch (err) {
      console.error("[handleToggleAlertRule] Error:", err);
    }
  };

  // Delete Alert Rule
  const handleDeleteAlertRule = async (id: string) => {
    if (!confirm("Are you sure you want to remove this alert rule?")) return;
    try {
      const res = await fetch(`/api/governance/alerts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAlertRules((prev) => prev.filter((r) => r.id !== id));
        setAlertFeedback({ type: "success", message: "Alert rule deleted successfully." });
      }
    } catch (err) {
      console.error("[handleDeleteAlertRule] Error:", err);
    }
  };

  // Trigger Test Alert
  const handleTestAlert = async (rule: AlertRule) => {
    setTestAlertSending(rule.id);
    setAlertFeedback(null);
    try {
      const res = await fetch("/api/governance/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test: true,
          ruleName: rule.name,
          testPayload: `Simulation triggered for rule '${rule.name}' matching pattern '${rule.eventPattern}' with threshold '${rule.severityThreshold}'.`,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAlertFeedback({
          type: "success",
          message: `Test alert dispatched to: ${rule.recipientEmails.length > 0 ? rule.recipientEmails.join(", ") : "Default platform administrator"}.`,
        });
      } else {
        setAlertFeedback({ type: "error", message: data.error || "Failed to dispatch test alert." });
      }
    } catch (err) {
      setAlertFeedback({ type: "error", message: "Network error sending test alert." });
    } finally {
      setTestAlertSending(null);
    }
  };

  // Save / Create Alert Rule
  const handleSaveAlertRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertName.trim() || !alertPattern.trim()) return;
    setAlertSubmitting(true);
    setAlertFeedback(null);

    const emailList = alertEmails
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));

    try {
      if (editingAlertId) {
        const res = await fetch("/api/governance/alerts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingAlertId,
            name: alertName.trim(),
            eventPattern: alertPattern.trim(),
            severityThreshold: alertSeverity,
            recipientEmails: emailList,
          }),
        });
        if (res.ok) {
          setIsAlertModalOpen(false);
          fetchAlertRules();
          setAlertFeedback({ type: "success", message: "Alert rule updated successfully." });
        }
      } else {
        const res = await fetch("/api/governance/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: alertName.trim(),
            eventPattern: alertPattern.trim(),
            severityThreshold: alertSeverity,
            recipientEmails: emailList,
          }),
        });
        if (res.ok) {
          setIsAlertModalOpen(false);
          fetchAlertRules();
          setAlertFeedback({ type: "success", message: "New alert rule established successfully." });
        }
      }
    } catch (err) {
      console.error("[handleSaveAlertRule] Error:", err);
    } finally {
      setAlertSubmitting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Action badge renderer
  const renderActionBadge = (action?: string) => {
    if (!action) return null;
    const isDestructive =
      action.includes("DELETED") ||
      action.includes("PURGED") ||
      action.includes("REJECTED") ||
      action.includes("SUSPENDED");
    const isSuccess =
      action.includes("CREATED") ||
      action.includes("APPROVED") ||
      action.includes("PUBLISHED") ||
      action.includes("ACTIVATED");
    const isMutation =
      action.includes("LLM_PROVIDER") ||
      action.includes("SETTINGS") ||
      action.includes("ROLE") ||
      action.includes("PASSWORD");

    return (
      <Badge
        variant="outline"
        className={`font-mono text-[11px] font-semibold ${
          isDestructive
            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
            : isSuccess
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
            : isMutation
            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
            : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
        }`}
      >
        {action}
      </Badge>
    );
  };

  // Open detail modal with default view
  const openDetailModal = (record: AuditRecord) => {
    setJsonModalRecord(record);
    const hasChanges = Array.isArray(record.details?.changes) && record.details?.changes.length > 0;
    setModalViewMode(hasChanges ? "diff" : "json");
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Page Title & Stats Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Governance &amp; Compliance Hub
            </h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
              Tamper-Evident Ledger
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time multi-stream operational audits, delta diffing, alerting engine, user administration tracking, and LLM telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab !== "overview" && activeTab !== "alerting" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={loading || items.length === 0}
              className="h-8 gap-1.5 text-xs border-border"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading || overviewLoading || alertsLoading}
            className="h-8 gap-1.5 text-xs border-border"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || overviewLoading || alertsLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Categorized Two-Tier Sub-Navigation & Main Workspace */}
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Left Sub-Navigation Rail (Desktop) / Categorized Selector (Mobile) */}
        <aside className="w-full lg:w-64 shrink-0 flex flex-col gap-4 bg-card/60 border border-border rounded-2xl p-4 shadow-xs h-fit">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Report Directory</span>
            <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-2 py-0.5 rounded-md border border-border">9 Reports</span>
          </div>

          {/* Mobile Category Dropdown */}
          <div className="lg:hidden">
            <select
              value={activeTab}
              onChange={(e) => handleTabChange(e.target.value as TabKey)}
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground font-medium outline-none focus:border-primary"
            >
              {REPORT_CATEGORIES.map((cat) => (
                <optgroup key={cat.title} label={cat.title}>
                  {cat.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Desktop Categorized Navigation Rail */}
          <nav className="hidden lg:flex flex-col gap-4" aria-label="Governance Reports">
            {REPORT_CATEGORIES.map((cat) => (
              <div key={cat.title} className="space-y-1.5">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 block">
                  {cat.title}
                </span>
                <div className="space-y-1">
                  {cat.items.map((item) => {
                    const isActive = activeTab === item.id;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleTabChange(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left cursor-pointer ${
                          isActive
                            ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Right Content Panel */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Active Report Header & Search Strip */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl bg-card border border-border shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xs font-bold text-foreground shrink-0">
                {REPORT_CATEGORIES.flatMap((c) => c.items).find((i) => i.id === activeTab)?.label || "Report"}
              </span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground truncate">
                {activeTab === "overview"
                  ? "Operational metrics, incident breakdown & activity streams"
                  : activeTab === "alerting"
                  ? "Configured threshold notification rules & alert history"
                  : `${total} logged audit events`}
              </span>
            </div>

            {/* Search box for audit ledgers */}
            {activeTab !== "overview" && activeTab !== "alerting" && (
              <div className="relative w-full sm:w-72 shrink-0">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search audit trail..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-8 text-xs bg-background border-border"
                />
              </div>
            )}
          </div>

        {/* ── TAB 1: OVERVIEW DASHBOARD ── */}
        {activeTab === "overview" && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Timeframe & Summary Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-card border border-border shadow-xs">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-foreground">Governance Operational Metrics</span>
                <span className="text-xs text-muted-foreground">• Live telemetry &amp; security snapshots</span>
              </div>
              <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border text-xs">
                {([
                  { label: "Today", value: 1 },
                  { label: "Last 7 Days", value: 7 },
                  { label: "Last 30 Days", value: 30 },
                ] as const).map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setOverviewRange(r.value)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      overviewRange === r.value
                        ? "bg-card text-foreground shadow-xs border border-border"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4 Primary Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
                <div className="flex items-center justify-between text-muted-foreground mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Total Audit Events</span>
                  <Shield className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-2xl font-extrabold text-foreground">
                  {overviewData?.totalEvents ?? "—"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                  <span>24h: <strong className="text-foreground">{overviewData?.total24h ?? 0}</strong></span>
                  <span>•</span>
                  <span>7d: <strong className="text-foreground">{overviewData?.total7d ?? 0}</strong></span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
                <div className="flex items-center justify-between text-muted-foreground mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Security &amp; Model Mutations</span>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-extrabold text-amber-500">
                  {overviewData?.criticalMutations ?? "—"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Roles, LLM models, and vault keys modified
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
                <div className="flex items-center justify-between text-muted-foreground mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Agents Telemetry Executions</span>
                  <Activity className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-2xl font-extrabold text-emerald-500">
                  {overviewData?.activeTelemetry ?? "—"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  LLM token inferences &amp; tool dispatches
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
                <div className="flex items-center justify-between text-muted-foreground mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider">System Prompt Revisions</span>
                  <Terminal className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-2xl font-extrabold text-purple-500">
                  {overviewData?.promptRevisions ?? "—"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Immutable agent directive snapshots
                </div>
              </div>
            </div>

            {/* Middle Row: Category Breakdown & Top Operators */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Category Breakdown */}
              <div className="lg:col-span-2 p-5 rounded-2xl bg-card border border-border shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
                    <Layers className="w-4 h-4 text-primary" />
                    Operational Event Distribution by Category ({overviewRange}d)
                  </h3>
                  <div className="space-y-3">
                    {overviewData?.categoryBreakdown && overviewData.categoryBreakdown.length > 0 ? (
                      overviewData.categoryBreakdown.map((cat) => {
                        const maxCount = Math.max(
                          ...overviewData.categoryBreakdown.map((c) => c.count),
                          1
                        );
                        const pct = Math.round((cat.count / maxCount) * 100);
                        return (
                          <div key={cat.category} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-foreground uppercase tracking-wide font-mono text-[11px]">
                                {cat.category.replace(/_/g, " ")}
                              </span>
                              <span className="text-muted-foreground font-mono">
                                {cat.count} events
                              </span>
                            </div>
                            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all duration-500"
                                style={{ width: `${Math.max(pct, 5)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-xs text-muted-foreground py-6 text-center">
                        No category event records in this timeframe.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Top Operators */}
              <div className="p-5 rounded-2xl bg-card border border-border shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-primary" />
                    Top Active Operators
                  </h3>
                  <div className="space-y-2.5">
                    {overviewData?.topActors && overviewData.topActors.length > 0 ? (
                      overviewData.topActors.map((actor, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-xl bg-background border border-border/60 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center shrink-0">
                              {actor.email ? actor.email.charAt(0).toUpperCase() : "U"}
                            </div>
                            <span className="font-mono text-[11px] truncate text-foreground">
                              {actor.email}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-[10px] bg-muted border-border shrink-0">
                            {actor.count} ops
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground py-6 text-center">
                        No active operators registered.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Row: Recent Critical Mutations Feed */}
            <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Recent Critical Mutations &amp; Platform Configuration Changes
                </h3>
                <span className="text-xs text-muted-foreground">Showing last 10 operations</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/70 text-muted-foreground border-b border-border font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-4">Action</th>
                      <th className="py-2.5 px-4">Resource / Target</th>
                      <th className="py-2.5 px-4">Operator</th>
                      <th className="py-2.5 px-4">IP Address</th>
                      <th className="py-2.5 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {overviewData?.recentMutations && overviewData.recentMutations.length > 0 ? (
                      overviewData.recentMutations.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-2.5 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                            {new Date(row.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            {renderActionBadge(row.action)}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="font-semibold text-foreground">{row.targetName || row.targetId || row.resource || "—"}</span>
                            {row.targetId && row.targetId !== row.targetName && (
                              <span className="text-[10px] text-muted-foreground block font-mono">{row.targetId}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-muted-foreground font-mono text-[11px]">
                            {row.actorEmail || "System Core"}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-muted-foreground">
                            {row.ipAddress || "—"}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDetailModal(row)}
                              className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
                            >
                              <Code className="w-3.5 h-3.5" /> Details
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                          No recent mutations registered.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: ALERTING RULES ── */}
        {activeTab === "alerting" && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Alert Feedback Banner */}
            {alertFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                  alertFeedback.type === "success"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  {alertFeedback.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  <span>{alertFeedback.message}</span>
                </div>
                <button onClick={() => setAlertFeedback(null)} className="text-muted-foreground hover:text-foreground">×</button>
              </div>
            )}

            {/* Header / New Rule CTA */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border shadow-xs">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  Automated Governance Alerting Engine
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure real-time email dispatch rules when LLM models, user roles, system settings, or prompts are mutated.
                </p>
              </div>

              <Button
                size="sm"
                onClick={() => {
                  setEditingAlertId(null);
                  setAlertName("");
                  setAlertPattern("*");
                  setAlertSeverity("warning");
                  setAlertEmails("");
                  setIsAlertModalOpen(true);
                }}
                className="text-xs gap-1.5 bg-primary text-primary-foreground font-bold shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Alert Rule
              </Button>
            </div>

            {/* Rules Table */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/70 text-muted-foreground border-b border-border font-semibold">
                    <tr>
                      <th className="py-3 px-4">Rule Name</th>
                      <th className="py-3 px-4">Event Pattern</th>
                      <th className="py-3 px-4">Severity Threshold</th>
                      <th className="py-3 px-4">Recipients</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {alertRules.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-muted-foreground">
                          No alert rules configured. Click &apos;Add Alert Rule&apos; to set up your first policy.
                        </td>
                      </tr>
                    ) : (
                      alertRules.map((rule) => (
                        <tr key={rule.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-bold text-foreground block">{rule.name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">ID: {rule.id}</span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px]">
                            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                              {rule.eventPattern}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase font-bold ${
                                rule.severityThreshold === "critical"
                                  ? "bg-rose-500/10 text-rose-500 border-rose-500/30"
                                  : rule.severityThreshold === "warning"
                                  ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                  : "bg-blue-500/10 text-blue-500 border-blue-500/30"
                              }`}
                            >
                              {rule.severityThreshold}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1 max-w-[280px]">
                              {rule.recipientEmails.length > 0 ? (
                                rule.recipientEmails.map((email, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-muted border border-border"
                                  >
                                    <Mail className="w-2.5 h-2.5 text-muted-foreground" />
                                    {email}
                                  </span>
                                ))
                              ) : (
                                <span className="text-muted-foreground text-[11px]">Primary Admin Only</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={rule.enabled}
                                onCheckedChange={() => handleToggleAlertRule(rule)}
                              />
                              <span className="text-[11px] font-semibold text-muted-foreground">
                                {rule.enabled ? "Active" : "Disabled"}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleTestAlert(rule)}
                                disabled={testAlertSending === rule.id}
                                className="h-7 text-xs px-2 gap-1 border-border text-foreground hover:bg-muted"
                                title="Send a test notification to verify SMTP delivery"
                              >
                                <Send className={`w-3 h-3 ${testAlertSending === rule.id ? "animate-pulse" : ""}`} />
                                Test Alert
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingAlertId(rule.id);
                                  setAlertName(rule.name);
                                  setAlertPattern(rule.eventPattern);
                                  setAlertSeverity(rule.severityThreshold);
                                  setAlertEmails(rule.recipientEmails.join(", "));
                                  setIsAlertModalOpen(true);
                                }}
                                className="h-7 text-xs px-2 border-border"
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteAlertRule(rule.id)}
                                className="h-7 text-xs px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TABS 3+: AUDIT LEDGER TABLES ── */}
        {activeTab !== "overview" && activeTab !== "alerting" && (
          <div className="flex-1 rounded-md border border-border bg-card overflow-hidden flex flex-col">
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-xs">Loading audit ledger records...</span>
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                  <Clock className="w-8 h-8 opacity-40" />
                  <span className="text-sm font-medium">No records found</span>
                  <span className="text-xs">No ledger entries match the current filter parameters.</span>
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/70 text-muted-foreground border-b border-border font-medium sticky top-0">
                    {activeTab === "agents_activity" ? (
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                        <th className="py-2.5 px-4 font-semibold">Provider / Model</th>
                        <th className="py-2.5 px-4 font-semibold">Tokens (In / Out / Think)</th>
                        <th className="py-2.5 px-4 font-semibold">Latency</th>
                        <th className="py-2.5 px-4 font-semibold">Tools Executed</th>
                        <th className="py-2.5 px-4 font-semibold">Cost</th>
                        <th className="py-2.5 px-4 text-right font-semibold">Actions</th>
                      </tr>
                    ) : activeTab === "asset_revisions" ? (
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                        <th className="py-2.5 px-4 font-semibold">Asset Type</th>
                        <th className="py-2.5 px-4 font-semibold">Asset Key</th>
                        <th className="py-2.5 px-4 font-semibold">Version</th>
                        <th className="py-2.5 px-4 font-semibold">Author</th>
                        <th className="py-2.5 px-4 font-semibold">Change Summary</th>
                        <th className="py-2.5 px-4 text-right font-semibold">Actions</th>
                      </tr>
                    ) : activeTab === "prompt_revisions" ? (
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                        <th className="py-2.5 px-4 font-semibold">Agent Name</th>
                        <th className="py-2.5 px-4 font-semibold">Agentflow Title</th>
                        <th className="py-2.5 px-4 font-semibold">Version #</th>
                        <th className="py-2.5 px-4 font-semibold">Author</th>
                        <th className="py-2.5 px-4 font-semibold">Characters</th>
                        <th className="py-2.5 px-4 text-right font-semibold">Actions</th>
                      </tr>
                    ) : (
                      /* Default Audit Log View */
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                        <th className="py-2.5 px-4 font-semibold">Action</th>
                        <th className="py-2.5 px-4 font-semibold">Resource</th>
                        <th className="py-2.5 px-4 font-semibold">Target</th>
                        <th className="py-2.5 px-4 font-semibold">Actor</th>
                        <th className="py-2.5 px-4 font-semibold">IP Address</th>
                        <th className="py-2.5 px-4 text-right font-semibold">Details</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {items.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap font-mono text-[11px]">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>

                        {activeTab === "agents_activity" ? (
                          <>
                            <td className="py-2.5 px-4">
                              <div className="font-semibold text-foreground">{row.modelName || "Default"}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{row.provider || "openai"}</div>
                            </td>
                            <td className="py-2.5 px-4 font-mono text-muted-foreground">
                              {row.inputTokens ?? 0} / {row.outputTokens ?? 0}
                              {row.reasoningTokens ? ` (${row.reasoningTokens})` : ""}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-muted-foreground">
                              {row.executionLatencyMs ? `${row.executionLatencyMs}ms` : "—"}
                            </td>
                            <td className="py-2.5 px-4">
                              <Badge variant="outline" className="text-[10px] bg-muted">
                                {Array.isArray(row.executedMcpTools) ? row.executedMcpTools.length : 0} tools
                              </Badge>
                            </td>
                            <td className="py-2.5 px-4 font-mono text-emerald-600 dark:text-emerald-400">
                              {row.transactionCost ? `$${row.transactionCost.toFixed(5)}` : "$0.00000"}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDetailModal(row)}
                                className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
                              >
                                <Code className="w-3.5 h-3.5" /> Details
                              </Button>
                            </td>
                          </>
                        ) : activeTab === "asset_revisions" ? (
                          <>
                            <td className="py-2.5 px-4 font-mono uppercase text-muted-foreground">
                              {row.assetType}
                            </td>
                            <td className="py-2.5 px-4 font-bold text-foreground">
                              {row.assetKey}
                            </td>
                            <td className="py-2.5 px-4">
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {row.version}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-4 text-muted-foreground">
                              {row.authorEmail || "System"}
                            </td>
                            <td className="py-2.5 px-4 text-muted-foreground truncate max-w-xs">
                              {row.changeSummary || "—"}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenDiff(row, "asset")}
                                className="h-7 text-xs px-2 gap-1 border-border"
                              >
                                <GitCompare className="w-3.5 h-3.5 text-primary" />
                                View Diff
                              </Button>
                            </td>
                          </>
                        ) : activeTab === "prompt_revisions" ? (
                          <>
                            <td className="py-2.5 px-4">
                              <div className="font-bold text-foreground">{row.agentName || "Agent"}</div>
                              <div className="text-[10px] text-muted-foreground">{row.agentRole || "Role"}</div>
                            </td>
                            <td className="py-2.5 px-4 text-muted-foreground font-mono">
                              {row.agentflowTitle || row.agentflowId || "Flow"}
                            </td>
                            <td className="py-2.5 px-4">
                              <Badge variant="outline" className="font-mono text-[10px] bg-primary/5 text-primary border-primary/20">
                                v{row.versionNumber || 1}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-4 text-muted-foreground">
                              {row.authorEmail || "System"}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-muted-foreground">
                              {row.promptLengthChars ? `${row.promptLengthChars} chars` : "—"}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenDiff(row, "prompt")}
                                className="h-7 text-xs px-2 gap-1 border-border"
                              >
                                <GitCompare className="w-3.5 h-3.5 text-primary" />
                                View Diff
                              </Button>
                            </td>
                          </>
                        ) : (
                          /* Standard Audit Logs Row */
                          <>
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              {renderActionBadge(row.action)}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-muted-foreground">
                              {row.resource || "—"}
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="font-semibold text-foreground">{row.targetName || row.targetId || "—"}</div>
                              {row.targetId && row.targetId !== row.targetName && (
                                <div className="text-[10px] text-muted-foreground font-mono">{row.targetId}</div>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-muted-foreground">
                              {row.actorEmail || row.actorId || "System Core"}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-[11px] text-muted-foreground">
                              {row.ipAddress || "—"}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDetailModal(row)}
                                className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
                              >
                                <Code className="w-3.5 h-3.5" /> Details
                              </Button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Footer */}
            <div className="py-2 px-4 border-t border-border bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
              <div>
                Showing {items.length > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
                {Math.min(page * pageSize, total)} of {total} records
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="h-7 w-7 p-0 border-border"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="font-mono text-xs font-medium text-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="h-7 w-7 p-0 border-border"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Structured JSON & Visual Delta Diff Modal */}
      {jsonModalRecord && (
        <Dialog open={Boolean(jsonModalRecord)} onOpenChange={() => setJsonModalRecord(null)}>
          <DialogContent className="max-w-2xl bg-card text-card-foreground border-border">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <Code className="w-4 h-4 text-primary" /> Audit Record Details
                </DialogTitle>
                {Array.isArray(jsonModalRecord.details?.changes) && jsonModalRecord.details.changes.length > 0 && (
                  <div className="flex items-center bg-muted/80 p-0.5 rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => setModalViewMode("diff")}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
                        modalViewMode === "diff"
                          ? "bg-card text-primary shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Visual Delta Diff
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalViewMode("json")}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
                        modalViewMode === "json"
                          ? "bg-card text-primary shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Raw JSON
                    </button>
                  </div>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                Action: <strong className="text-foreground">{jsonModalRecord.action || "TELEMETRY"}</strong> • Timestamp:{" "}
                {new Date(jsonModalRecord.createdAt).toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            {modalViewMode === "diff" && Array.isArray(jsonModalRecord.details?.changes) && jsonModalRecord.details.changes.length > 0 ? (
              <div className="mt-2 max-h-[60vh] overflow-auto rounded-xl border border-border bg-background p-3.5 space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 pb-1 border-b border-border">
                  <GitCompare className="w-3.5 h-3.5 text-primary" />
                  Key-Level Mutations ({jsonModalRecord.details.changes.length})
                </div>

                <div className="space-y-2">
                  {jsonModalRecord.details.changes.map((change: any, idx: number) => {
                    const isAdded = change.changeType === "added_model" || change.type === "added_model";
                    const isRemoved = change.changeType === "removed_model" || change.type === "removed_model";

                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border text-xs space-y-1.5 ${
                          isAdded
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : isRemoved
                            ? "border-rose-500/30 bg-rose-500/5"
                            : "border-border bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-foreground font-mono text-[11px]">
                            {change.label || change.field || change.model || "Mutation"}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] font-bold uppercase ${
                              isAdded
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                : isRemoved
                                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                            }`}
                          >
                            {change.changeType || change.type || "MODIFIED"}
                          </Badge>
                        </div>

                        {change.oldValue !== undefined || change.newValue !== undefined ? (
                          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mt-1">
                            <div className="p-1.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400">
                              <span className="text-[9px] uppercase tracking-wider block font-bold text-rose-500/70">Previous Value:</span>
                              <span className="line-through">{JSON.stringify(change.oldValue)}</span>
                            </div>
                            <div className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                              <span className="text-[9px] uppercase tracking-wider block font-bold text-emerald-500/70">New Value:</span>
                              <span className="font-bold">{JSON.stringify(change.newValue)}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] font-mono text-muted-foreground">
                            {JSON.stringify(change)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-2 max-h-[60vh] overflow-auto rounded border border-border bg-background p-3 font-mono text-xs text-foreground">
                <pre className="whitespace-pre-wrap break-all">
                  {JSON.stringify(jsonModalRecord.details || jsonModalRecord, null, 2)}
                </pre>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Alert Rule Create / Edit Dialog */}
      <Dialog open={isAlertModalOpen} onOpenChange={setIsAlertModalOpen}>
        <DialogContent className="max-w-md bg-card text-card-foreground border-border">
          <form onSubmit={handleSaveAlertRule}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                {editingAlertId ? "Edit Governance Alert Rule" : "Create Governance Alert Rule"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Automated email alerts will be dispatched when matching operational mutations occur.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3 text-xs">
              <div>
                <label className="font-semibold text-foreground block mb-1">Rule Name</label>
                <Input
                  value={alertName}
                  onChange={(e) => setAlertName(e.target.value)}
                  placeholder="e.g. LLM Providers & Models Mutation Alert"
                  required
                  className="h-8 text-xs bg-background border-border"
                />
              </div>

              <div>
                <label className="font-semibold text-foreground block mb-1">
                  Event Action Pattern <span className="text-muted-foreground font-normal">(Wildcards supported, e.g. LLM_PROVIDER_*, ROLE_*, *)</span>
                </label>
                <Input
                  value={alertPattern}
                  onChange={(e) => setAlertPattern(e.target.value)}
                  placeholder="e.g. LLM_PROVIDER_* or *"
                  required
                  className="h-8 text-xs bg-background border-border font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-foreground block mb-1">Severity Threshold</label>
                <select
                  value={alertSeverity}
                  onChange={(e) => setAlertSeverity(e.target.value as any)}
                  className="w-full h-8 px-2 rounded-md bg-background border border-border text-foreground text-xs"
                >
                  <option value="all">All Events (Informational &amp; Critical)</option>
                  <option value="warning">Warning &amp; Critical Mutations Only</option>
                  <option value="critical">Strictly Critical Security Elevations Only</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-foreground block mb-1">
                  Recipient Emails <span className="text-muted-foreground font-normal">(Comma-separated)</span>
                </label>
                <Input
                  value={alertEmails}
                  onChange={(e) => setAlertEmails(e.target.value)}
                  placeholder="e.g. ciso@savazai.local, devops@savazai.local"
                  className="h-8 text-xs bg-background border-border"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAlertModalOpen(false)}
                className="text-xs border-border"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={alertSubmitting}
                className="text-xs font-bold bg-primary text-primary-foreground"
              >
                {alertSubmitting ? "Saving..." : editingAlertId ? "Update Rule" : "Create Rule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diff Viewer Modal for Prompt & Asset versions */}
      <DiffViewerModal
        isOpen={diffState.isOpen}
        onClose={() => setDiffState((s) => ({ ...s, isOpen: false }))}
        title={diffState.title}
        subtitle={diffState.subtitle}
        badgeLabel={diffState.badgeLabel}
        oldVersionLabel={diffState.oldVersionLabel}
        newVersionLabel={diffState.newVersionLabel}
        oldContent={diffState.oldContent}
        newContent={diffState.newContent}
        authorEmail={diffState.authorEmail}
        timestamp={diffState.timestamp}
      />
    </div>
  );
}
