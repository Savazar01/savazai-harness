"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Plus, FolderKanban, Loader2, X, Database, Download, Upload } from "lucide-react";
import { CanvasEditor, CanvasEditorHandle, CanvasNode, CanvasEdge } from "@/components/studio/canvas-editor";

interface Agentflow {
  id: string;
  name: string;
  description: string | null;
  workspaceMode: string;
  status: string;
  canvasDefinition: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validateAgentflowJson = (json: any): { valid: boolean; error?: string } => {
  if (typeof json !== "object" || json === null) {
    return { valid: false, error: "JSON must be an object." };
  }
  if (typeof json.name !== "string" || !json.name.trim()) {
    return { valid: false, error: "Missing or invalid 'name' field." };
  }
  if (json.description !== undefined && json.description !== null && typeof json.description !== "string") {
    return { valid: false, error: "'description' must be a string." };
  }
  if (json.canvasDefinition !== undefined) {
    if (typeof json.canvasDefinition !== "object" || json.canvasDefinition === null) {
      return { valid: false, error: "'canvasDefinition' must be an object." };
    }
    const nodes = json.canvasDefinition.nodes;
    if (nodes !== undefined && !Array.isArray(nodes)) {
      return { valid: false, error: "'canvasDefinition.nodes' must be an array." };
    }
    const edges = json.canvasDefinition.edges;
    if (edges !== undefined && !Array.isArray(edges)) {
      return { valid: false, error: "'canvasDefinition.edges' must be an array." };
    }
  }
  return { valid: true };
};

export default function StudioPage() {
  const [agentflows, setAgentflows] = useState<Agentflow[]>([]);
  const [activeAgentflowId, setActiveAgentflowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMode, setCreateMode] = useState<"scratch" | "import">("scratch");
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingAgentflow, setEditingAgentflow] = useState<Agentflow | null>(null);
  const [deletingAgentflowId, setDeletingAgentflowId] = useState<string | null>(null);
  
  // Form states
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  
  // Action status indicators
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [canvasLoadKey, setCanvasLoadKey] = useState(0);
  const [saveToast, setSaveToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const initialLoadDone = useRef(false);
  const canvasEditorRef = useRef<CanvasEditorHandle>(null);

  const fetchAgentflows = useCallback(async () => {
    try {
      const res = await fetch("/api/agentflows");
      if (res.ok) {
        const data: Agentflow[] = await res.json();
        setAgentflows(data);
        if (data.length > 0 && !initialLoadDone.current) {
          setActiveAgentflowId(data[0].id);
          initialLoadDone.current = true;
        }
      }
    } catch (err) {
      console.error("Failed to fetch agentflows:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAgentflows();
  }, [fetchAgentflows]);

  const handleCreateAgentflow = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/agentflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim() || null,
          workspaceMode: "interactive",
          status: "draft",
          canvasDefinition: {},
        }),
      });
      if (res.ok) {
        const created: Agentflow = await res.json();
        setAgentflows((prev) => [...prev, created]);
        setActiveAgentflowId(created.id);
        setShowCreateModal(false);
        setCreateName("");
        setCreateDesc("");
      }
    } catch (err) {
      console.error("Failed to create agentflow:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateAgentflow = async () => {
    if (!editingAgentflow || !editName.trim()) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/agentflows/${editingAgentflow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || null,
        }),
      });
      if (res.ok) {
        const updated: Agentflow = await res.json();
        setAgentflows((prev) =>
          prev.map((w) => (w.id === updated.id ? { ...w, name: updated.name, description: updated.description } : w))
        );
        setEditingAgentflow(null);
      }
    } catch (err) {
      console.error("Failed to update agentflow:", err);
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveDraft = async (nodes: CanvasNode[], edges: CanvasEdge[], suppressToast?: boolean): Promise<boolean> => {
    if (!activeAgentflowId) return false;
    try {
      const canvasPayload = {
        workflowType: "interactive",
        nodes,
        edges,
      };
      const res = await fetch(`/api/agentflows/${activeAgentflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasDefinition: canvasPayload,
          status: "draft",
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        if (!suppressToast) setSaveToast({ msg: `DB save failed: ${errText}`, type: "error" });
        return false;
      }
      setAgentflows((prev) =>
        prev.map((w) =>
          w.id === activeAgentflowId
            ? { ...w, canvasDefinition: canvasPayload as unknown as Record<string, unknown>, status: "draft", updatedAt: new Date().toISOString() }
            : w
        )
      );
      if (!suppressToast) {
        setSaveToast({ msg: "Saved to DB", type: "success" });
        setTimeout(() => setSaveToast(null), 3000);
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to save draft:", err);
      if (!suppressToast) setSaveToast({ msg: `DB save error: ${msg}`, type: "error" });
      return false;
    }
  };

  const handlePublish = async (canvasJson: string) => {
    if (!activeAgentflowId) return { success: false, error: "No active agentflow" } as const;
    try {
      const res = await fetch("/api/orchestrator/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: canvasJson,
      });
      const data = await res.json();
      if (res.ok) {
        await fetch(`/api/agentflows/${activeAgentflowId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "published",
            canvasDefinition: (() => {
              try { return JSON.parse(canvasJson); } catch { return {}; }
            })(),
          }),
        });
        setAgentflows((prev) =>
          prev.map((w) => (w.id === activeAgentflowId ? { ...w, status: "published" } : w))
        );
        return { success: true, message: data.message || "Published successfully!" } as const;
      }
      return { success: false, error: data.error || "Compilation failed." } as const;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg } as const;
    }
  };

  const handleSwitchAgentflow = useCallback(async (newId: string) => {
    if (newId === activeAgentflowId) return;
    // Auto-save current canvas before switching
    const snapshot = canvasEditorRef.current?.getSnapshot();
    if (snapshot && activeAgentflowId && (snapshot.nodes.length > 0 || snapshot.edges.length > 0)) {
      localStorage.setItem(`savazai_canvas_${activeAgentflowId}`, JSON.stringify(snapshot));
      await handleSaveDraft(snapshot.nodes, snapshot.edges, true);
    }
    setActiveAgentflowId(newId);
    setCanvasLoadKey((k) => k + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgentflowId]);

  // Visibility change: save to localStorage when tab hidden
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        const snap = canvasEditorRef.current?.getSnapshot();
        if (snap && activeAgentflowId) {
          localStorage.setItem(`savazai_canvas_${activeAgentflowId}`, JSON.stringify(snap));
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [activeAgentflowId]);

  // Auto-clear toast after timeout
  useEffect(() => {
    if (!saveToast) return;
    const t = setTimeout(() => setSaveToast(null), 3000);
    return () => clearTimeout(t);
  }, [saveToast]);

  const handleDuplicateAgentflow = async (wf: Agentflow) => {
    try {
      const res = await fetch("/api/agentflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${wf.name} (Copy)`,
          description: wf.description,
          workspaceMode: wf.workspaceMode,
          status: "draft",
          canvasDefinition: wf.canvasDefinition,
        }),
      });
      if (res.ok) {
        const created: Agentflow = await res.json();
        setAgentflows((prev) => [...prev, created]);
        setActiveAgentflowId(created.id);
        setCanvasLoadKey((k) => k + 1);
      }
    } catch (err) {
      console.error("Failed to duplicate agentflow:", err);
    }
  };

  const handleDeleteAgentflow = async (id: string) => {
    try {
      const res = await fetch(`/api/agentflows/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAgentflows((prev) => prev.filter((w) => w.id !== id));
        if (activeAgentflowId === id) {
          const remaining = agentflows.filter((w) => w.id !== id);
          setActiveAgentflowId(remaining.length > 0 ? remaining[0].id : null);
          setCanvasLoadKey((k) => k + 1);
        }
      }
    } catch (err) {
      console.error("Failed to delete agentflow:", err);
    }
  };

  const handleExportJson = (wf: Agentflow) => {
    const snap = canvasEditorRef.current?.getSnapshot();
    const isCurrentActive = wf.id === activeAgentflowId;
    const canvasDefinition = (isCurrentActive && snap) ? {
      workflowType: "interactive",
      nodes: snap.nodes,
      edges: snap.edges
    } : wf.canvasDefinition;

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
      name: wf.name,
      description: wf.description,
      workspaceMode: wf.workspaceMode,
      canvasDefinition
    }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    const sanitizedName = wf.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    downloadAnchor.setAttribute("download", `${sanitizedName}_v1.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        setImportError("Invalid JSON formatting.");
        return;
      }

      const validation = validateAgentflowJson(json);
      if (!validation.valid) {
        setImportError(validation.error || "Invalid Agentflow structure.");
        return;
      }

      const res = await fetch("/api/agentflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${json.name} (Imported)`,
          description: json.description || null,
          workspaceMode: json.workspaceMode || "interactive",
          status: "draft",
          canvasDefinition: json.canvasDefinition || {},
        }),
      });

      if (res.ok) {
        const created: Agentflow = await res.json();
        setAgentflows((prev) => [...prev, created]);
        setActiveAgentflowId(created.id);
        setCanvasLoadKey((k) => k + 1);
        setShowImportModal(false);
        setShowCreateModal(false); // Close create modal if import executed inside it
      } else {
        const errText = await res.text();
        setImportError(`Backend save failed: ${errText}`);
      }
    } catch (err) {
      console.error("Import failed:", err);
      setImportError("An error occurred reading or parsing the file.");
    }
  };

  const activeAgentflow = agentflows.find((w) => w.id === activeAgentflowId);
  const activeStatus = (activeAgentflow?.status as "draft" | "published") || "draft";

  const getCanvasData = (wf: Agentflow | undefined): { nodes: CanvasNode[]; edges: CanvasEdge[] } => {
    if (!wf?.canvasDefinition) return { nodes: [], edges: [] };
    const cd = wf.canvasDefinition as Record<string, unknown>;
    const rawNodes = cd.nodes as Array<Record<string, unknown>> | undefined;
    if (!rawNodes || !Array.isArray(rawNodes)) return { nodes: [], edges: [] };
    const nodes: CanvasNode[] = rawNodes.map((n, idx) => ({
      ...n as unknown as CanvasNode,
      x: typeof n.x === "number" ? n.x : 100 + (idx % 3) * 200,
      y: typeof n.y === "number" ? n.y : 100 + Math.floor(idx / 3) * 150,
      tools: (n.tools as CanvasNode["tools"]) || [],
      memoryCheckpoint: n.memoryCheckpoint !== false,
      kvPersistence: n.kvPersistence === true,
    } as CanvasNode));
    const edges: CanvasEdge[] = (cd.edges as CanvasEdge[]) || [];
    return { nodes, edges };
  };

  const canvasData = getCanvasData(activeAgentflow);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 p-4 sm:p-6 h-screen overflow-y-auto sm:overflow-hidden">
      <div className="shrink-0 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Capability Studio</h1>
          <p className="text-slate-500 text-xs mt-1">Design pure agent-to-agent graphs, schedule autonomous agentflows, and compile to LangGraph pipelines</p>
        </div>
      </div>

      {/* Agentflow Selector Bar */}
      <div className="shrink-0 mb-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-900 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <FolderKanban className="h-4 w-4 text-indigo-400 shrink-0" />
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Active Workspace:</span>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
          ) : agentflows.length === 0 ? (
            <span className="text-xs text-slate-500">No agentflows</span>
          ) : (
            <div className="relative">
              <select
                value={activeAgentflowId || ""}
                onChange={(e) => handleSwitchAgentflow(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 rounded-xl px-3 py-1.5 focus:border-indigo-500 outline-none transition-all cursor-pointer min-w-[200px]"
              >
                {agentflows.map((wf) => (
                  <option key={wf.id} value={wf.id}>
                    {wf.name} ({wf.status === "published" ? "Published" : "Draft"})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeAgentflow && (
            <button
              type="button"
              onClick={() => handleExportJson(activeAgentflow)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-800 bg-slate-900/40 text-slate-355 hover:text-white hover:bg-slate-900 transition-all shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              Export JSON
            </button>
          )}
          <button
            type="button"
            onClick={() => { setImportError(null); setShowImportModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-800 bg-slate-900/40 text-slate-355 hover:text-white hover:bg-slate-900 transition-all shadow-sm"
          >
            <Upload className="h-3.5 w-3.5" />
            Import JSON
          </button>
          <button
            type="button"
            onClick={() => setShowManageModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-800 bg-slate-900/40 text-slate-300 hover:text-white hover:bg-slate-900 transition-all shadow-sm"
          >
            <FolderKanban className="h-3.5 w-3.5" />
            Manage Agentflows
          </button>
          <button
            type="button"
            onClick={() => { setCreateMode("scratch"); setShowCreateModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            New Agentflow
          </button>
        </div>
      </div>

      {/* Save Toast Indicator */}
      {saveToast && (
        <div className={`shrink-0 mb-3 flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-semibold transition-all ${
          saveToast.type === "success"
            ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-400"
            : "bg-red-950/30 border-red-500/40 text-red-400"
        }`}>
          <Database className="h-3.5 w-3.5 shrink-0" />
          <span>{saveToast.msg}</span>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        {activeAgentflow ? (
          <CanvasEditor
            ref={canvasEditorRef}
            initialNodes={canvasData.nodes}
            initialEdges={canvasData.edges}
            globalSystemPrompt=""
            workflowName={activeAgentflow.name}
            workflowStatus={activeStatus}
            onSaveDraft={handleSaveDraft}
            onPublish={handlePublish}
            onRename={() => {
              setEditingAgentflow(activeAgentflow);
              setEditName(activeAgentflow.name);
              setEditDesc(activeAgentflow.description || "");
            }}
            workflowId={activeAgentflow.id}
            canvasLoadKey={canvasLoadKey}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">
            {loading ? "Loading agentflows..." : "Create or import an agentflow to get started"}
          </div>
        )}
      </div>

      {/* Create / Import Agentflow Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div onClick={() => setShowCreateModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-white">Create New Agentflow</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            
            {/* Mode selection tabs */}
            <div className="flex bg-slate-900/60 border border-slate-800 rounded-xl p-0.5 mb-5">
              <button
                type="button"
                onClick={() => setCreateMode("scratch")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  createMode === "scratch"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Start from Scratch
              </button>
              <button
                type="button"
                onClick={() => { setImportError(null); setCreateMode("import"); }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  createMode === "import"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Import from JSON File
              </button>
            </div>

            {createMode === "scratch" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-200 uppercase tracking-wider mb-1.5">Agentflow Name</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. Wedding Planning Pipeline"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/20 py-2.5 px-4 text-xs text-white outline-none focus:border-indigo-500 placeholder-slate-400"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-200 uppercase tracking-wider mb-1.5">Description (optional)</label>
                  <textarea
                    rows={3}
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    placeholder="Brief description of this agentflow..."
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/20 py-2.5 px-4 text-xs text-white outline-none focus:border-indigo-500 resize-none placeholder-slate-400"
                  />
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-semibold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateAgentflow}
                    disabled={!createName.trim() || creating}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Create Agentflow"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-200 uppercase tracking-wider mb-1.5">Select JSON Config File</label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportJson}
                    className="w-full text-xs text-slate-200 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border file:border-slate-800 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800 cursor-pointer file:cursor-pointer"
                  />
                </div>
                {importError && (
                  <div className="text-red-300 text-xs font-semibold bg-red-950/20 border border-red-500/20 rounded-xl p-3 leading-relaxed">
                    ⚠️ {importError}
                  </div>
                )}
                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-semibold transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Agentflow Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div onClick={() => setShowImportModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-white">Import Agentflow (JSON)</h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-200 uppercase tracking-wider mb-1.5">Select JSON Config File</label>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJson}
                  className="w-full text-xs text-slate-200 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border file:border-slate-800 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800 cursor-pointer file:cursor-pointer"
                />
              </div>
              {importError && (
                <div className="text-red-300 text-xs font-semibold bg-red-950/20 border border-red-500/20 rounded-xl p-3 leading-relaxed">
                  ⚠️ {importError}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-semibold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Rename Agentflow Modal */}
      {editingAgentflow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div onClick={() => setEditingAgentflow(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-white">Rename Agentflow</h3>
              <button onClick={() => setEditingAgentflow(null)} className="text-slate-505 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-200 uppercase tracking-wider mb-1.5">Agentflow Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Wedding Planning Pipeline"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/20 py-2.5 px-4 text-xs text-white outline-none focus:border-indigo-500 placeholder-slate-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-200 uppercase tracking-wider mb-1.5">Description (optional)</label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Brief description of this agentflow..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/20 py-2.5 px-4 text-xs text-white outline-none focus:border-indigo-500 resize-none placeholder-slate-400"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setEditingAgentflow(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateAgentflow}
                disabled={!editName.trim() || updating}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Agentflow Confirmation Modal */}
      {deletingAgentflowId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center animate-in fade-in duration-200">
          <div onClick={() => setDeletingAgentflowId(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Delete Agentflow</h3>
              <button onClick={() => setDeletingAgentflowId(null)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-200 mb-6 leading-relaxed">
              Are you sure you want to delete this agentflow? This action is permanent and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeletingAgentflowId(null)}
                className="flex-1 py-2 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-semibold bg-slate-900/40 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDeleteAgentflow(deletingAgentflowId);
                  setDeletingAgentflowId(null);
                }}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Manage Agentflows Modal */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div onClick={() => setShowManageModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-4xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">📂 Manage Agentflows</h3>
                <p className="text-[10px] text-slate-300 mt-0.5">Search, duplicate, export, open, or delete saved agentflows</p>
              </div>
              <button onClick={() => setShowManageModal(false)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search and actions bar */}
            <div className="mb-4 flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agentflows by name..."
                className="flex-1 rounded-xl border border-slate-900 bg-slate-900/30 py-2 px-3 text-xs text-white outline-none focus:border-indigo-500 placeholder-slate-400"
              />
              <button
                type="button"
                onClick={() => { setImportError(null); setShowImportModal(true); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-800 bg-slate-900/40 text-slate-355 hover:text-white hover:bg-slate-900 transition-all shadow-sm shrink-0"
              >
                <Upload className="h-3.5 w-3.5" />
                Import JSON
              </button>
            </div>

            {/* Table list */}
            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800 border border-slate-900 rounded-2xl bg-[#040408] p-1.5">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Agentflow Name</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Last Updated</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agentflows
                    .filter((w) => w.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((wf) => {
                      const isActive = activeAgentflowId === wf.id;
                      return (
                        <tr key={wf.id} className={`border-b border-slate-900/60 hover:bg-slate-900/10 transition-all ${isActive ? "bg-indigo-600/5" : ""}`}>
                          <td className="py-3 px-3">
                            <span className="font-semibold text-slate-200 block truncate max-w-[240px]">{wf.name}</span>
                            <span className="text-[10px] text-slate-350 truncate max-w-[240px] block mt-0.5">{wf.description || "No description provided"}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider ${
                              wf.status === "published"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}>
                              {wf.status === "published" ? "Published" : "Draft"}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-[10px] text-slate-500 font-mono">
                            {new Date(wf.updatedAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => { handleSwitchAgentflow(wf.id); setShowManageModal(false); }}
                                disabled={isActive}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                                  isActive
                                    ? "bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed"
                                    : "bg-indigo-600/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-600 hover:text-white"
                                }`}
                              >
                                Open
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingAgentflow(wf);
                                  setEditName(wf.name);
                                  setEditDesc(wf.description || "");
                                }}
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-white transition-all"
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateAgentflow(wf)}
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-white transition-all"
                              >
                                Duplicate
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExportJson(wf)}
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-white transition-all"
                              >
                                Export
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingAgentflowId(wf.id)}
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold border border-red-500/15 text-red-400 hover:bg-red-950/40 hover:border-red-500/40 transition-all"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-900 text-right">
              <button
                type="button"
                onClick={() => setShowManageModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-850 text-slate-400 hover:text-white text-xs font-semibold transition-all"
              >
                Close Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
