"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Bot,
  Wrench,
  Sparkles,
  Clock,
  Lock,
  Unlock,
  Plus,
  Search,
  RefreshCw,
  Copy,
  Trash2,
  Edit2,
  Workflow,
  Cpu,
  ShieldAlert,
  ArrowRight,
  Filter,
  CheckCircle2,
  FileCode,
  LayoutGrid,
  List,
  ArrowUpDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentCatalogItem } from "@/app/api/agents/route";
import { AgentDrawer } from "@/components/studio/agent-drawer";
import { CanvasNode, AgentRole } from "@/components/studio/canvas-editor";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function AgentCatalogView() {
  const [agents, setAgents] = useState<AgentCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");
  const [lockedFilter, setLockedFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortField, setSortField] = useState<"name" | "role" | "model" | "tools" | "updated">("updated");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeCanvasNode, setActiveCanvasNode] = useState<CanvasNode | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentCatalogItem | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<AgentCatalogItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (originFilter !== "all") params.set("originType", originFilter);
      if (lockedFilter === "locked") params.set("isLocked", "true");
      if (lockedFilter === "unlocked") params.set("isLocked", "false");

      const res = await fetch(`/api/agents?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data.items || []);
      }
    } catch (err) {
      console.error("[AgentCatalogView] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, originFilter, lockedFilter]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleCreateNew = () => {
    setSelectedAgent(null);
    const defaultNode: CanvasNode = {
      id: crypto.randomUUID(),
      label: "New Specialist Agent",
      roleTemplate: "worker",
      systemPrompt: "You are a dedicated specialist agent. Execute assigned domain tasks using bound tools. Return structured, verified outputs.",
      modelConfig: {
        provider: "openai",
        model: "gpt-4o-mini",
        temperature: 0.7,
      },
      tools: [],
      x: 0,
      y: 0,
      isLocked: false,
      data: {
        description: "",
        agentKey: "",
        allowModificationInFlow: true,
      },
    };
    setActiveCanvasNode(defaultNode);
    setDrawerOpen(true);
  };

  const handleEdit = (agent: AgentCatalogItem) => {
    setSelectedAgent(agent);
    const node: CanvasNode = {
      id: agent.id,
      label: agent.name,
      roleTemplate: (agent.role as AgentRole) || "worker",
      systemPrompt: agent.systemPrompt || "",
      modelConfig: {
        provider: agent.llmProvider || "openai",
        model: agent.modelName || "gpt-4o-mini",
        temperature: typeof agent.temperature === "number" ? agent.temperature : 0.7,
      },
      tools: Array.isArray(agent.boundTools) ? agent.boundTools : [],
      isLocked: agent.isLocked,
      x: 0,
      y: 0,
      data: {
        description: agent.description || "",
        agentKey: agent.agentKey,
        allowModificationInFlow: agent.allowModificationInFlow,
        originType: agent.originType,
        originFlowId: agent.originFlowId,
        originFlowTitle: agent.originFlowTitle,
      },
    };
    setActiveCanvasNode(node);
    setDrawerOpen(true);
  };

  const handleSaveNode = async (updated: CanvasNode) => {
    const payload = {
      name: updated.label,
      role: updated.roleTemplate,
      description: (updated.data?.description as string) || "",
      agentKey: (updated.data?.agentKey as string) || undefined,
      llmProvider: updated.modelConfig?.provider || "openai",
      modelName: updated.modelConfig?.model || "gpt-4o-mini",
      temperature: updated.modelConfig?.temperature ?? 0.7,
      systemPrompt: updated.systemPrompt,
      boundTools: updated.tools || [],
      isLocked: Boolean(updated.isLocked),
      allowModificationInFlow: updated.data?.allowModificationInFlow !== false,
    };

    if (selectedAgent && selectedAgent.id) {
      // Update existing
      const res = await fetch(`/api/agents/${selectedAgent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update agent.");
      }
      setToastMessage({ text: `Agent "${updated.label}" updated successfully.`, type: "success" });
    } else {
      // Create new
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create agent.");
      }
      setToastMessage({ text: `Agent "${updated.label}" created in catalog.`, type: "success" });
    }

    setDrawerOpen(false);
    setActiveCanvasNode(null);
    fetchAgents();
  };

  const handleClone = async (agent: AgentCatalogItem) => {
    try {
      const clonedPayload = {
        name: `${agent.name} (Copy)`,
        role: agent.role,
        description: agent.description,
        llmProvider: agent.llmProvider,
        modelName: agent.modelName,
        temperature: agent.temperature,
        systemPrompt: agent.systemPrompt,
        boundTools: agent.boundTools,
        isLocked: false,
        allowModificationInFlow: true,
      };

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clonedPayload),
      });

      if (res.ok) {
        setToastMessage({ text: `Cloned agent "${agent.name}" successfully!`, type: "success" });
        fetchAgents();
      }
    } catch {
      setToastMessage({ text: "Failed to clone agent.", type: "error" });
    }
  };

  const handleSyncFromFlows = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_from_flows" }),
      });
      const data = await res.json();
      if (res.ok) {
        setToastMessage({ text: data.message || "Synced agents from flows!", type: "success" });
        fetchAgents();
      } else {
        setToastMessage({ text: data.error || "Sync failed.", type: "error" });
      }
    } catch {
      setToastMessage({ text: "Sync request failed.", type: "error" });
    } finally {
      setSyncing(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/agents/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setToastMessage({ text: `Agent "${deleteTarget.name}" deleted.`, type: "success" });
        setDeleteTarget(null);
        fetchAgents();
      } else {
        const data = await res.json().catch(() => ({}));
        setToastMessage({ text: data.error || "Delete failed.", type: "error" });
      }
    } catch {
      setToastMessage({ text: "Network error during delete.", type: "error" });
    } finally {
      setIsDeleting(false);
    }
  };

  // Summary counts
  const stats = useMemo(() => {
    return {
      total: agents.length,
      supervisors: agents.filter((a) => a.role === "supervisor").length,
      specialists: agents.filter((a) => a.role === "worker" || a.role === "specialist").length,
      synthesizers: agents.filter((a) => a.role === "synthesizer").length,
      locked: agents.filter((a) => a.isLocked).length,
    };
  }, [agents]);

  // Sorted agents
  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      if (sortField === "name") {
        return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      if (sortField === "role") {
        return sortAsc ? a.role.localeCompare(b.role) : b.role.localeCompare(a.role);
      }
      if (sortField === "model") {
        const mA = `${a.llmProvider}/${a.modelName}`;
        const mB = `${b.llmProvider}/${b.modelName}`;
        return sortAsc ? mA.localeCompare(mB) : mB.localeCompare(mA);
      }
      if (sortField === "tools") {
        const tA = Array.isArray(a.boundTools) ? a.boundTools.length : 0;
        const tB = Array.isArray(b.boundTools) ? b.boundTools.length : 0;
        return sortAsc ? tA - tB : tB - tA;
      }
      // updated
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return sortAsc ? dateA - dateB : dateB - dateA;
    });
  }, [agents, sortField, sortAsc]);

  const toggleSort = (field: "name" | "role" | "model" | "tools" | "updated") => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "supervisor":
        return <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[10px]">Supervisor</Badge>;
      case "synthesizer":
        return <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]">Synthesizer</Badge>;
      case "scheduled":
        return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">Scheduled</Badge>;
      default:
        return <Badge className="bg-teal-500/10 text-teal-400 border-teal-500/20 text-[10px]">Specialist</Badge>;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground overflow-y-auto space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-2xl shadow-2xl border text-xs flex items-center gap-2 animate-in slide-in-from-bottom duration-200 ${
            toastMessage.type === "success"
              ? "bg-card border-emerald-500/40 text-emerald-400"
              : "bg-card border-destructive/40 text-destructive"
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-muted-foreground hover:text-foreground">
            ×
          </button>
        </div>
      )}

      {/* Hero / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h2 className="text-xl font-extrabold text-foreground tracking-tight flex items-center gap-2.5">
            <Bot className="h-6 w-6 text-primary" />
            Agent Catalog & Builder Hub
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Centrally author, configure, version, and manage reusable enterprise agents independently of workflows
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncFromFlows}
            disabled={syncing}
            className="text-xs gap-1.5 border-border"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            Sync from Flows
          </Button>

          <Button
            size="sm"
            onClick={handleCreateNew}
            className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-bold shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Agent
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-2xl bg-card border border-border shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Total Catalog</span>
          <span className="text-xl font-extrabold text-foreground mt-0.5 block">{stats.total}</span>
        </div>
        <div className="p-3.5 rounded-2xl bg-card border border-border shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Supervisors</span>
          <span className="text-xl font-extrabold text-indigo-400 mt-0.5 block">{stats.supervisors}</span>
        </div>
        <div className="p-3.5 rounded-2xl bg-card border border-border shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Specialists</span>
          <span className="text-xl font-extrabold text-teal-400 mt-0.5 block">{stats.specialists}</span>
        </div>
        <div className="p-3.5 rounded-2xl bg-card border border-border shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Synthesizers</span>
          <span className="text-xl font-extrabold text-purple-400 mt-0.5 block">{stats.synthesizers}</span>
        </div>
        <div className="p-3.5 rounded-2xl bg-card border border-border shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Enterprise Locked</span>
          <span className="text-xl font-extrabold text-amber-400 mt-0.5 block">{stats.locked}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 rounded-2xl bg-card border border-border">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by agent name, key, or directive..."
              className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Role Filter Chips */}
          <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border text-xs">
            {["all", "supervisor", "worker", "synthesizer", "scheduled"].map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all capitalize ${
                  roleFilter === r
                    ? "bg-card text-foreground shadow-xs border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r === "all" ? "All Roles" : r}
              </button>
            ))}
          </div>

          {/* Origin Filter */}
          <select
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-background border border-border text-foreground text-xs focus:outline-none"
          >
            <option value="all">All Origins</option>
            <option value="agent_builder">Standalone</option>
            <option value="agentflow">Flow Imported</option>
          </select>

          {/* Locked Filter */}
          <select
            value={lockedFilter}
            onChange={(e) => setLockedFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-background border border-border text-foreground text-xs focus:outline-none"
          >
            <option value="all">All Policies</option>
            <option value="locked">Locked Only</option>
            <option value="unlocked">Unlocked Only</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border ml-1">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "grid"
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Grid Card View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "list"
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="High-Density List Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Agents Grid / List View */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-muted-foreground text-xs">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          Loading universal agent catalog...
        </div>
      ) : sortedAgents.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border border-dashed border-border bg-card">
          <Bot className="w-10 h-10 text-muted-foreground/60 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-foreground">No Agents Found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {search || roleFilter !== "all"
              ? "No agents matched your current filter criteria."
              : "Create a standalone agent or click 'Sync from Flows' to import existing canvas agents."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button size="sm" onClick={handleCreateNew} className="text-xs gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Create Agent
            </Button>
            <Button size="sm" variant="outline" onClick={handleSyncFromFlows} className="text-xs gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Sync from Flows
            </Button>
          </div>
        </div>
      ) : viewMode === "list" ? (
        /* High-Density List Mode Table */
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/70 text-muted-foreground border-b border-border font-semibold">
                <tr>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort("name")}
                      className="flex items-center gap-1 hover:text-foreground transition-colors font-semibold"
                    >
                      <span>Agent Name &amp; Key</span>
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort("role")}
                      className="flex items-center gap-1 hover:text-foreground transition-colors font-semibold"
                    >
                      <span>Role Archetype</span>
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort("model")}
                      className="flex items-center gap-1 hover:text-foreground transition-colors font-semibold"
                    >
                      <span>Provider &amp; Model</span>
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort("tools")}
                      className="flex items-center gap-1 hover:text-foreground transition-colors font-semibold"
                    >
                      <span>Bound Tools</span>
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </th>
                  <th className="py-3 px-4">Flow Consumption</th>
                  <th className="py-3 px-4">Policy</th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort("updated")}
                      className="flex items-center gap-1 hover:text-foreground transition-colors font-semibold"
                    >
                      <span>Updated</span>
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sortedAgents.map((agent) => {
                  const toolCount = Array.isArray(agent.boundTools) ? agent.boundTools.length : 0;
                  return (
                    <tr key={agent.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                            {agent.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-foreground block hover:text-primary transition-colors cursor-pointer" onClick={() => handleEdit(agent)}>
                              {agent.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono block">
                              {agent.agentKey}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getRoleBadge(agent.role)}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        <span className="text-foreground font-semibold">{agent.llmProvider}</span>
                        <span className="text-muted-foreground"> / {agent.modelName}</span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-[10px] bg-muted font-mono gap-1">
                          <Wrench className="w-2.5 h-2.5 text-muted-foreground" />
                          {toolCount} tools
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        {agent.usedInFlows && agent.usedInFlows > 0 ? (
                          <span
                            className="text-[10px] text-teal-400 font-mono bg-teal-500/10 px-2 py-0.5 rounded-md border border-teal-500/20 cursor-help inline-flex items-center gap-1"
                            title={agent.usedFlowNames && agent.usedFlowNames.length > 0 ? `Used in: ${agent.usedFlowNames.join(", ")}` : `Used in ${agent.usedInFlows} flow(s)`}
                          >
                            <Workflow className="w-2.5 h-2.5" />
                            {agent.usedInFlows} flow{agent.usedInFlows > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Standalone / Unassigned
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {agent.isLocked ? (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1">
                            <Lock className="w-2.5 h-2.5" /> Locked
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground border-border gap-1">
                            <Unlock className="w-2.5 h-2.5" /> Editable
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {agent.updatedAt ? new Date(agent.updatedAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleClone(agent)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            title="Clone Agent"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(agent)}
                            className="h-7 text-xs px-2 gap-1 border-border"
                          >
                            <Edit2 className="w-3 h-3" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(agent)}
                            disabled={agent.isLocked}
                            className={`h-7 w-7 p-0 ${
                              agent.isLocked
                                ? "opacity-30 cursor-not-allowed text-muted-foreground"
                                : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            }`}
                            title={agent.isLocked ? "Cannot delete locked agent" : "Delete Agent"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Grid Mode Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedAgents.map((agent) => {
            const toolCount = Array.isArray(agent.boundTools) ? agent.boundTools.length : 0;
            return (
              <div
                key={agent.id}
                className="group p-5 rounded-2xl bg-card border border-border hover:border-border/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {getRoleBadge(agent.role)}
                      {agent.isLocked ? (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1">
                          <Lock className="w-2.5 h-2.5" /> Locked
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground border-border gap-1">
                          <Unlock className="w-2.5 h-2.5" /> Flow Editable
                        </Badge>
                      )}
                    </div>

                    {agent.usedInFlows && agent.usedInFlows > 0 ? (
                      <span
                        className="text-[10px] text-teal-400 font-mono bg-teal-500/10 px-2 py-0.5 rounded-md border border-teal-500/20 cursor-help flex items-center gap-1"
                        title={agent.usedFlowNames && agent.usedFlowNames.length > 0 ? `Used in: ${agent.usedFlowNames.join(", ")}` : `Used in ${agent.usedInFlows} flow(s)`}
                      >
                        <Workflow className="w-2.5 h-2.5" />
                        Used in {agent.usedInFlows} flow{agent.usedInFlows > 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Unassigned
                      </span>
                    )}
                  </div>

                  {/* Title & Key */}
                  <div>
                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
                      <span className="truncate">{agent.name}</span>
                    </h3>
                    <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                      {agent.agentKey}
                    </div>
                  </div>

                  {/* Description / System Prompt Preview */}
                  <p className="text-xs text-muted-foreground line-clamp-3 bg-muted/30 p-2.5 rounded-xl border border-border/50 text-[11px] leading-relaxed">
                    {agent.description || agent.systemPrompt}
                  </p>
                </div>

                {/* Metadata & Actions */}
                <div className="space-y-3 pt-3 border-t border-border/60">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1 font-mono">
                      <Cpu className="w-3 h-3 text-primary" />
                      <span>{agent.llmProvider} / {agent.modelName}</span>
                    </div>

                    <div className="flex items-center gap-1 font-mono">
                      <Wrench className="w-3 h-3 text-muted-foreground" />
                      <span>{toolCount} tools</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                      {agent.originType === "agentflow" ? (
                        <span className="text-teal-400">Flow: {agent.originFlowTitle || "Canvas"}</span>
                      ) : (
                        <span className="text-muted-foreground">Standalone</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleClone(agent)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Clone Agent"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleEdit(agent)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Edit Agent"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(agent)}
                        disabled={agent.isLocked}
                        className={`p-1.5 rounded-lg transition-colors ${
                          agent.isLocked
                            ? "opacity-30 cursor-not-allowed text-muted-foreground"
                            : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        }`}
                        title={agent.isLocked ? "Cannot delete locked agent" : "Delete Agent"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Canonical 8-Tab Agent Drawer */}
      {drawerOpen && activeCanvasNode && (
        <AgentDrawer
          mode="standalone_builder"
          node={activeCanvasNode}
          allNodes={[]}
          onClose={() => {
            setDrawerOpen(false);
            setActiveCanvasNode(null);
          }}
          onSave={handleSaveNode}
        />
      )}

      {/* Styled Delete Confirmation Dialog */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-5 h-5" />
              Delete Catalog Agent?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to permanently delete agent{" "}
              <strong className="text-foreground">"{deleteTarget?.name}"</strong>?
              Workflows that currently reference this agent catalog entry may lose upstream synchronization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Agent"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
