"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Database, 
  Plus, 
  Trash2, 
  Loader2, 
  BookOpen,
  X
} from "lucide-react";

interface KnowledgeFact {
  id: string;
  category: string;
  factKey: string;
  factValue: string;
  updatedAt: string;
}

interface RagNamespace {
  name: string;
  nodeCount: number;
  totalEmbeddings: number;
}

export function KnowledgeHub() {
  const [facts, setFacts] = useState<KnowledgeFact[]>([]);
  const [loadingFacts, setLoadingFacts] = useState(false);
  const [savingFact, setSavingFact] = useState(false);

  // New fact form
  const [newCategory, setNewCategory] = useState("SOP");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  // RAG settings
  const [namespaces, setNamespaces] = useState<RagNamespace[]>([
    { name: "wedplanai-guestlist", nodeCount: 1, totalEmbeddings: 154 },
    { name: "wedplanai-vendors", nodeCount: 2, totalEmbeddings: 298 },
    { name: "corporate-rules-anonymized", nodeCount: 1, totalEmbeddings: 42 }
  ]);
  const [newNamespaceName, setNewNamespaceName] = useState("");

  const fetchFacts = useCallback(async () => {
    setLoadingFacts(true);
    try {
      const res = await fetch("/api/okf/knowledge");
      if (res.ok) {
        const data = await res.json();
        setFacts(data.facts || []);
      }
    } catch (err) {
      console.error("Failed to load OKF facts:", err);
    } finally {
      setLoadingFacts(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFacts();
  }, [fetchFacts]);

  const handleAddFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey || !newValue) return;

    setSavingFact(true);
    try {
      const res = await fetch("/api/okf/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: newCategory,
          factKey: newKey,
          factValue: newValue
        })
      });
      if (res.ok) {
        setNewKey("");
        setNewValue("");
        fetchFacts();
      }
    } catch (err) {
      console.error("Failed to add OKF fact:", err);
    } finally {
      setSavingFact(false);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteFact = async (id: string) => {
    try {
      const res = await fetch(`/api/okf/knowledge?id=${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        fetchFacts();
      }
    } catch (err) {
      console.error("Failed to delete fact:", err);
    }
  };

  const handleCreateNamespace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNamespaceName) return;

    const exists = namespaces.some(n => n.name === newNamespaceName);
    if (!exists) {
      setNamespaces([
        ...namespaces,
        { name: newNamespaceName, nodeCount: 0, totalEmbeddings: 0 }
      ]);
      setNewNamespaceName("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Knowledge Hub Intro */}
      <div>
        <h3 className="text-lg font-bold text-white mb-1">Open Knowledge Framework (OKF) &amp; RAG Manager</h3>
        <p className="text-slate-400 text-xs">Expose shared facts matrix, corporate templates, SOP compliance documentation, and vector indexes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Hand: OKF Fact Matrix (Col span 2) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-slate-900 bg-slate-950/40 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-400" />
              Shared Knowledge Facts &amp; SOP Registry
            </h4>
            <p className="text-[10px] text-slate-300 leading-normal">
              Corporate entities, business properties, and compliance bounds registered here are injected dynamically into the context vector space of all sub-agents and supervisory chains.
            </p>

            {/* Fact Input Form */}
            <form onSubmit={handleAddFact} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-900/10 border border-slate-900 p-4 rounded-xl">
              <div>
                <label className="block text-[8px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Category</label>
                <select 
                  value={newCategory} 
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 py-1.5 px-2 text-xs text-white"
                >
                  <option value="SOP">SOP Rule</option>
                  <option value="FACT">Domain Fact</option>
                  <option value="GUIDELINE">Guideline</option>
                  <option value="RESTRICTION">Constraint</option>
                </select>
              </div>
              <div>
                <label className="block text-[8px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Entity Reference Key</label>
                <input 
                  type="text" 
                  value={newKey} 
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="e.g. support_email" 
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 py-1.5 px-2 text-xs text-white placeholder-slate-450"
                  required
                />
              </div>
              <div className="md:col-span-2 flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-[8px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Fact Value / Rule String</label>
                  <input 
                    type="text" 
                    value={newValue} 
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="e.g. info@savazar.com" 
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 py-1.5 px-2 text-xs text-white placeholder-slate-450"
                    required
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={savingFact}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 shrink-0 shadow-md shadow-indigo-600/20 disabled:opacity-40"
                >
                  {savingFact ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Register
                </button>
              </div>
            </form>

            {/* Facts list */}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-900">
              {loadingFacts ? (
                <div className="flex justify-center items-center py-6 text-slate-500 text-xs gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading OKF entities...
                </div>
              ) : facts.length === 0 ? (
                <div className="text-slate-600 italic text-center py-8 text-xs">
                  No registered corporate knowledge facts found. Add one above.
                </div>
              ) : (
                facts.map((fact) => (
                  <div key={fact.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-900 bg-slate-950/20 hover:border-slate-850 transition-all">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className={`px-1.5 py-0.2 rounded font-mono font-bold uppercase tracking-wider text-[7px] shrink-0 mt-0.5 ${
                        fact.category === "SOP" ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" :
                        fact.category === "FACT" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" :
                        fact.category === "GUIDELINE" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                        "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}>
                        {fact.category}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold text-slate-200 font-mono block truncate">{fact.factKey}</span>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-normal">{fact.factValue}</p>
                      </div>
                    </div>
                    
                    <button 
                      type="button" 
                      onClick={() => setDeletingId(fact.id)}
                      className="p-1 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-all shrink-0 ml-2"
                      title="Remove fact"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Hand: RAG Namespace List (Col span 1) */}
        <div className="space-y-6">
          <div className="border border-slate-900 bg-slate-950/40 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Database className="h-4 w-4 text-cyan-400" />
              RAG Vector Index Namespaces
            </h4>
            <p className="text-[10px] text-slate-300 leading-normal">
              Manage semantic chunks stored inside `pgvector` database container bridge on Port 5622.
            </p>

            {/* Create Namespace Form */}
            <form onSubmit={handleCreateNamespace} className="flex gap-2">
              <input 
                type="text" 
                value={newNamespaceName} 
                onChange={(e) => setNewNamespaceName(e.target.value)}
                placeholder="new-vector-namespace"
                className="flex-1 rounded-lg border border-slate-800 bg-slate-955 py-1.5 px-3 text-xs text-white outline-none focus:border-indigo-500 placeholder-slate-450"
                required
              />
              <button 
                type="submit"
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold shrink-0 shadow-md shadow-cyan-600/20 transition-all"
              >
                Add
              </button>
            </form>

            {/* Namespace List */}
            <div className="space-y-2">
              {namespaces.map((ns) => (
                <div key={ns.name} className="p-3 rounded-xl border border-slate-900 bg-[#040408]/40 hover:border-slate-855 transition-all">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-white font-mono truncate max-w-[65%]">{ns.name}</span>
                    <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[8px] px-1 py-0.2 rounded font-mono">
                      {ns.totalEmbeddings} vectors
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-350 mt-2">
                    <span>Active compilation nodes: {ns.nodeCount}</span>
                    <button 
                      type="button" 
                      onClick={() => setNamespaces(namespaces.filter(n => n.name !== ns.name))}
                      className="text-slate-600 hover:text-red-400 transition-colors p-0.5 rounded"
                      title="Delete index namespace"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-200">
          <div onClick={() => setDeletingId(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Delete Knowledge Entity</h3>
              <button onClick={() => setDeletingId(null)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-200 mb-6 leading-relaxed">
              Are you sure you want to delete this knowledge entity? This action is permanent and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="flex-1 py-2 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-semibold bg-slate-900/40 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDeleteFact(deletingId);
                  setDeletingId(null);
                }}
                className="flex-1 py-2 rounded-xl bg-red-650 hover:bg-red-500 text-white text-xs font-bold transition-all"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
