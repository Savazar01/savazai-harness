"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
} from "lucide-react";
import { DiffViewerModal } from "./diff-viewer-modal";

type TabKey =
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
  agentflowId?: string;
  versionNumber?: number;
  systemPrompt?: string;
}

export function GovernanceDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>("user_admin");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<AuditRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // JSON viewer modal
  const [jsonModalRecord, setJsonModalRecord] = useState<AuditRecord | null>(null);

  // Diff viewer modal
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

  // Fetch data
  const fetchData = useCallback(async () => {
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
  }, [activeTab, debouncedSearch, page]);

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
          title: `Agent Directive Diff: ${current.agent_id}`,
          subtitle: `Flow ID: ${current.agentflow_id}`,
          badgeLabel: "System Prompt",
          oldVersionLabel: previous ? `v${previous.version_number}` : "Initial Baseline (v0)",
          newVersionLabel: `v${current.version_number}`,
          oldContent: previous ? previous.system_prompt : "",
          newContent: current.system_prompt,
          authorEmail: current.author_email,
          timestamp: current.created_at,
        });
      } else {
        setDiffState({
          isOpen: true,
          title: `Asset Revision Diff: ${current.asset_key}`,
          subtitle: `${current.asset_type.toUpperCase()} • ${current.change_summary || "Revision comparison"}`,
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
      // Fetch up to 500 items for export
      const params = new URLSearchParams({
        tab: activeTab,
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

      // Generate CSV
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

    return (
      <Badge
        variant="outline"
        className={`font-mono text-[11px] font-semibold ${
          isDestructive
            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
            : isSuccess
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
            : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
        }`}
      >
        {action}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Page Title & Stats Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Governance & Compliance Hub
            </h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
              Tamper-Evident Ledger
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time multi-stream operational audits, user administration tracking, asset versioning, and LLM telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="h-8 gap-1.5 text-xs border-border"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
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
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full flex-1 flex flex-col">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-2">
          <TabsList className="bg-muted p-1 border border-border h-auto flex flex-wrap gap-1">
            <TabsTrigger value="user_admin" className="text-xs gap-1.5 py-1.5 px-3">
              <Users className="w-3.5 h-3.5" /> User Admin
            </TabsTrigger>
            <TabsTrigger value="command_center" className="text-xs gap-1.5 py-1.5 px-3">
              <Sliders className="w-3.5 h-3.5" /> Command Center
            </TabsTrigger>
            <TabsTrigger value="business_center" className="text-xs gap-1.5 py-1.5 px-3">
              <Briefcase className="w-3.5 h-3.5" /> Business Center
            </TabsTrigger>
            <TabsTrigger value="agentflows" className="text-xs gap-1.5 py-1.5 px-3">
              <Workflow className="w-3.5 h-3.5" /> Agentflows
            </TabsTrigger>
            <TabsTrigger value="agents_activity" className="text-xs gap-1.5 py-1.5 px-3">
              <Activity className="w-3.5 h-3.5" /> Agents Telemetry
            </TabsTrigger>
            <TabsTrigger value="asset_revisions" className="text-xs gap-1.5 py-1.5 px-3">
              <FileCode className="w-3.5 h-3.5" /> Skills & OKF Versions
            </TabsTrigger>
            <TabsTrigger value="prompt_revisions" className="text-xs gap-1.5 py-1.5 px-3">
              <Terminal className="w-3.5 h-3.5" /> System Prompt Versions
            </TabsTrigger>
          </TabsList>

          {/* Search box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search audit trail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-xs bg-background border-border"
            />
          </div>
        </div>

        {/* Content Container */}
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
                      <th className="py-2.5 px-4 font-semibold">Agent Node ID</th>
                      <th className="py-2.5 px-4 font-semibold">Agentflow ID</th>
                      <th className="py-2.5 px-4 font-semibold">Version #</th>
                      <th className="py-2.5 px-4 font-semibold">Author</th>
                      <th className="py-2.5 px-4 font-semibold">Length</th>
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
                            <div className="text-[10px] text-muted-foreground">{row.provider || "System"}</div>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px]">
                            {row.inputTokens || 0} / {row.outputTokens || 0} / {row.reasoningTokens || 0}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px]">
                            {row.executionLatencyMs ? `${row.executionLatencyMs}ms` : "—"}
                          </td>
                          <td className="py-2.5 px-4">
                            {row.executedMcpTools && row.executedMcpTools.length > 0 ? (
                              <Badge variant="outline" className="text-[10px] bg-muted border-border">
                                {row.executedMcpTools.length} tool call(s)
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-[11px]">None</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px]">
                            ${(row.transactionCost || 0).toFixed(4)}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setJsonModalRecord(row)}
                              className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
                            >
                              <Code className="w-3.5 h-3.5" /> Payload
                            </Button>
                          </td>
                        </>
                      ) : activeTab === "asset_revisions" ? (
                        <>
                          <td className="py-2.5 px-4">
                            <Badge variant="outline" className="text-[10px] uppercase font-mono">
                              {row.assetType}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-foreground font-mono">
                            {row.assetKey}
                          </td>
                          <td className="py-2.5 px-4">
                            <Badge variant="secondary" className="text-[10px] font-mono">
                              {row.version}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4 text-muted-foreground">
                            {row.authorEmail || row.authorId}
                          </td>
                          <td className="py-2.5 px-4 text-muted-foreground max-w-xs truncate">
                            {row.changeSummary || "—"}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDiff(row, "asset")}
                              className="h-7 text-xs px-2.5 gap-1.5 border-border"
                            >
                              <GitCompare className="w-3.5 h-3.5 text-primary" />
                              View Diff
                            </Button>
                          </td>
                        </>
                      ) : activeTab === "prompt_revisions" ? (
                        <>
                          <td className="py-2.5 px-4 font-semibold text-foreground font-mono">
                            {row.agentId}
                          </td>
                          <td className="py-2.5 px-4 text-muted-foreground font-mono text-[11px]">
                            {row.agentflowId}
                          </td>
                          <td className="py-2.5 px-4">
                            <Badge variant="secondary" className="text-[10px] font-mono">
                              v{row.versionNumber}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4 text-muted-foreground">
                            {row.authorEmail || row.authorId}
                          </td>
                          <td className="py-2.5 px-4 text-muted-foreground font-mono text-[11px]">
                            {row.systemPrompt ? `${row.systemPrompt.length} chars` : "0 chars"}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDiff(row, "prompt")}
                              className="h-7 text-xs px-2.5 gap-1.5 border-border"
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
                              onClick={() => setJsonModalRecord(row)}
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
      </Tabs>

      {/* Structured JSON Modal */}
      {jsonModalRecord && (
        <Dialog open={Boolean(jsonModalRecord)} onOpenChange={() => setJsonModalRecord(null)}>
          <DialogContent className="max-w-2xl bg-card text-card-foreground border-border">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                <Code className="w-4 h-4 text-primary" /> Audit Record Details
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Action: {jsonModalRecord.action || "TELEMETRY"} • Timestamp:{" "}
                {new Date(jsonModalRecord.createdAt).toLocaleString()}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-2 max-h-[60vh] overflow-auto rounded border border-border bg-background p-3 font-mono text-xs text-foreground">
              <pre className="whitespace-pre-wrap break-all">
                {JSON.stringify(jsonModalRecord.details || jsonModalRecord, null, 2)}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Diff Viewer Modal */}
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
