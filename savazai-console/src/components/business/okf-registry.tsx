"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Plus, 
  Trash2, 
  Loader2, 
  Upload, 
  Download, 
  Save, 
  Edit, 
  BookOpen, 
  FileText,
  X
} from "lucide-react";
import { HelpTooltip } from "@/components/shared/help-tooltip";
import { AiAssistButton } from "@/components/shared/ai-assist-button";

export interface OkfConcept {
  id: string;
  category: string;
  conceptKey: string;
  yamlFrontmatter: string;
  markdownBody: string;
  updatedAt?: string;
}

export function OkfRegistry() {
  const [concepts, setConcepts] = useState<OkfConcept[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeConcept, setActiveConcept] = useState<OkfConcept | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  
  // Editor mode
  const [mode, setMode] = useState<"view" | "create" | "edit">("view");

  // Form inputs
  const [formKey, setFormKey] = useState("");
  const [formCategory, setFormCategory] = useState("SOP Guidelines");
  const [formType, setFormType] = useState("sop");
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formResource, setFormResource] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formMarkdown, setFormMarkdown] = useState("");

  const fetchConcepts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/okf");
      if (res.ok) {
        const data = await res.json();
        setConcepts(data.concepts || []);
      }
    } catch (err) {
      console.error("Failed to load OKF concepts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchConcepts();
  }, [fetchConcepts]);

  useEffect(() => {
    if (alertMessage) {
      const t = setTimeout(() => setAlertMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [alertMessage]);

  const parseOkfMarkdown = (content: string) => {
    const fmRegex = /^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(fmRegex);
    if (match) {
      const fmText = match[1];
      const body = match[2];
      const metadata: Record<string, string | string[]> = {};
      fmText.split("\n").forEach(line => {
        const parts = line.split(":");
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join(":").trim();
          if (val.startsWith("[") && val.endsWith("]")) {
            metadata[key] = val.slice(1, -1).split(",").map(v => v.trim().replace(/^['"]|['"]$/g, ""));
          } else {
            metadata[key] = val.replace(/^['"]|['"]$/g, "");
          }
        }
      });
      const typeVal = metadata.type || "sop";
      const titleVal = metadata.title || "";
      const descVal = metadata.description || "";
      const resourceVal = metadata.resource || "";
      const tagsVal = Array.isArray(metadata.tags) ? metadata.tags.join(", ") : (metadata.tags || "");
      return {
        type: Array.isArray(typeVal) ? typeVal[0] : typeVal,
        title: Array.isArray(titleVal) ? titleVal[0] : titleVal,
        description: Array.isArray(descVal) ? descVal[0] : descVal,
        resource: Array.isArray(resourceVal) ? resourceVal[0] : resourceVal,
        tags: tagsVal,
        markdownBody: body.trim()
      };
    }
    return {
      type: "sop",
      title: "",
      description: "",
      resource: "",
      tags: "",
      markdownBody: content.trim()
    };
  };

  const serializeOkf = (frontmatter: Record<string, string | string[]>, body: string) => {
    let fm = "---\n";
    Object.entries(frontmatter).forEach(([key, val]) => {
      if (key === "tags") {
        const tagsArr = typeof val === "string" ? val.split(",").map(t => t.trim()).filter(Boolean) : val;
        fm += `tags: [${tagsArr.map((t: string) => `"${t}"`).join(", ")}]\n`;
      } else {
        fm += `${key}: "${val}"\n`;
      }
    });
    fm += "---\n";
    return `${fm}${body}`;
  };

  const handleSelectConcept = (c: OkfConcept) => {
    setActiveConcept(c);
    
    // Parse frontmatter
    let parsedFm = { type: "sop", title: "", description: "", resource: "", tags: "" };
    try {
      const parsed = parseOkfMarkdown(`${c.yamlFrontmatter}\n\n${c.markdownBody}`);
      parsedFm = {
        type: parsed.type,
        title: parsed.title,
        description: parsed.description,
        resource: parsed.resource,
        tags: parsed.tags
      };
    } catch {}

    setFormKey(c.conceptKey);
    setFormCategory(c.category);
    setFormType(parsedFm.type);
    setFormTitle(parsedFm.title);
    setFormDesc(parsedFm.description);
    setFormResource(parsedFm.resource);
    setFormTags(parsedFm.tags);
    setFormMarkdown(c.markdownBody);
    setMode("view");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const parsed = parseOkfMarkdown(text);
        setFormKey(file.name.replace(/\.md$/i, "").toLowerCase().replace(/[^a-z0-9_]/g, "_"));
        setFormCategory("Imported SOP");
        setFormType(parsed.type);
        setFormTitle(parsed.title || file.name.replace(/\.md$/i, ""));
        setFormDesc(parsed.description || "Imported OKF Concept Bundle");
        setFormResource(parsed.resource);
        setFormTags(parsed.tags);
        setFormMarkdown(parsed.markdownBody);
        setMode("create");
      }
    };
    reader.readAsText(file);
  };

  const handleSaveConcept = async () => {
    if (!formKey || !formTitle || !formMarkdown) {
      setAlertMessage("Concept Key, Title, and Guidelines are required.");
      return;
    }

    const frontmatterObj = {
      type: formType,
      title: formTitle,
      description: formDesc,
      resource: formResource,
      tags: formTags,
      timestamp: new Date().toISOString()
    };

    const yamlFrontmatter = serializeOkf(frontmatterObj, "").replace(/---/g, "").trim();

    setLoading(true);
    try {
      if (mode === "create") {
        const res = await fetch("/api/okf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: formCategory,
            conceptKey: formKey,
            yamlFrontmatter,
            markdownBody: formMarkdown
          }),
        });
        if (res.ok) {
          await fetchConcepts();
          setMode("view");
          setActiveConcept(null);
        }
      } else if (mode === "edit" && activeConcept) {
        const res = await fetch("/api/okf", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: activeConcept.id,
            category: formCategory,
            conceptKey: formKey,
            yamlFrontmatter,
            markdownBody: formMarkdown
          }),
        });
        if (res.ok) {
          await fetchConcepts();
          setMode("view");
          setActiveConcept(null);
        }
      }
    } catch (err) {
      console.error("Failed to save OKF concept:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConcept = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/okf?id=${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await fetchConcepts();
        if (activeConcept?.id === id) {
          setActiveConcept(null);
          setMode("view");
        }
      }
    } catch (err) {
      console.error("Failed to delete concept:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportMarkdown = (c: OkfConcept) => {
    const frontmatterObj = {
      type: formType,
      title: formTitle,
      description: formDesc,
      resource: formResource,
      tags: formTags,
      timestamp: new Date().toISOString()
    };
    const content = serializeOkf(frontmatterObj, c.markdownBody);
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${c.conceptKey}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100vh-140px)] min-h-0">
      {/* Sidebar: OKF List & Upload */}
      <div className="lg:col-span-1 border border-slate-900 bg-slate-950/20 rounded-2xl flex flex-col min-h-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-900 bg-slate-950/40 flex justify-between items-center shrink-0">
          <span className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">Google OKF Registry <HelpTooltip content="Operational Knowledge Foundation (OKF) concepts store business SOPs, guidelines, compliance rules, and shared terminology as structured Markdown bundles with YAML frontmatter." side="right" /></span>
          <button 
            type="button" 
            onClick={() => {
              setFormKey("");
              setFormCategory("SOP Guidelines");
              setFormType("sop");
              setFormTitle("");
              setFormDesc("");
              setFormResource("");
              setFormTags("");
              setFormMarkdown("");
              setMode("create");
              setActiveConcept(null);
            }} 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-600/15"
          >
            <Plus className="h-3.5 w-3.5" /> New Concept
          </button>
        </div>

        {/* Drag & Drop Import */}
        <div className="p-4 border-b border-slate-900 bg-slate-900/10 space-y-3 shrink-0">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Ingest OKF Bundles</span>
          <label className="flex flex-col items-center justify-center border border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/30 hover:bg-slate-950/50 rounded-xl p-3 cursor-pointer transition-all">
            <Upload className="h-5 w-5 text-slate-400 mb-1" />
            <span className="text-[10px] text-slate-300 font-semibold">Drop OKF .md Concept File</span>
            <span className="text-[8px] text-slate-500">Auto-parses YAML Frontmatter tags</span>
            <input type="file" accept=".md" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {/* Concept Listing */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-850">
          {loading && concepts.length === 0 ? (
            <div className="flex justify-center items-center py-12 text-slate-500 text-xs gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Ingesting concepts...
            </div>
          ) : concepts.length === 0 ? (
            <p className="text-center text-slate-500 text-xs py-12">No OKF concepts persisted. Register a new concept bundle.</p>
          ) : (
            concepts.map((c) => (
              <div 
                key={c.id}
                onClick={() => handleSelectConcept(c)}
                className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                  activeConcept?.id === c.id 
                    ? "bg-indigo-500/10 border-indigo-500/30 text-white" 
                    : "border-slate-900 bg-slate-950/20 hover:border-slate-800"
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <span className="font-mono text-xs font-bold text-slate-200 block truncate">{c.conceptKey}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[9px] text-slate-400 capitalize font-medium">
                    {c.category}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    type="button" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingId(c.id);
                    }}
                    className="p-1 rounded hover:bg-red-500/15 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete concept"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor & Viewer panel */}
      <div className="lg:col-span-2 border border-slate-900 bg-slate-950/20 rounded-2xl flex flex-col min-h-0 overflow-hidden relative">
        {mode === "view" && activeConcept ? (
          /* VIEW MODE */
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-6 py-4 border-b border-slate-900 bg-slate-950/40 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <BookOpen className="h-4 w-4 text-indigo-400" />
                <div>
                  <h4 className="text-sm font-bold text-white">{formTitle || activeConcept.conceptKey}</h4>
                  <p className="text-[10px] text-slate-500">Google OKF SOP guidelines specification details</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={() => handleExportMarkdown(activeConcept)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/50 text-slate-350 hover:text-white text-xs font-semibold transition-all"
                >
                  <Download className="h-3.5 w-3.5" /> Export .md
                </button>
                <button 
                  type="button" 
                  onClick={() => setMode("edit")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-600/15"
                >
                  <Edit className="h-3.5 w-3.5" /> Edit Concept
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-850">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950/40 border border-slate-900 p-4 rounded-2xl text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">Namespace Category</span>
                  <span className="text-slate-200 font-medium">{activeConcept.category}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">OKF Schema Type</span>
                  <span className="text-slate-250 uppercase font-mono font-bold text-indigo-400">{formType}</span>
                </div>
                {formResource && (
                  <div className="col-span-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">External Resource</span>
                    <span className="text-slate-300 font-mono truncate block">{formResource}</span>
                  </div>
                )}
              </div>

              {formDesc && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Description Summary</span>
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/20 border border-slate-900 p-4 rounded-2xl">{formDesc}</p>
                </div>
              )}

              {formTags && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Tags / Index Identifiers</span>
                  <div className="flex flex-wrap gap-1.5">
                    {formTags.split(",").map(t => t.trim()).filter(Boolean).map((t, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded-md border border-slate-850 bg-slate-900/60 font-mono text-[10px] text-slate-400">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex-1 flex flex-col min-h-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Guidelines (Markdown)</span>
                <pre className="flex-1 rounded-2xl border border-slate-900 bg-[#06060c] p-4 text-[11px] text-slate-300 font-mono overflow-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-850 whitespace-pre-wrap">
                  {activeConcept.markdownBody}
                </pre>
              </div>
            </div>
          </div>
        ) : mode === "create" || mode === "edit" ? (
          /* CREATE / EDIT MODE */
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-6 py-4 border-b border-slate-900 bg-slate-950/40 flex justify-between items-center shrink-0">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                {mode === "create" ? "Create Google OKF v0.1 Concept" : `Edit Concept: ${formKey}`}
              </span>
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={() => setMode("view")}
                  className="px-3 py-1.5 rounded-xl border border-slate-850 text-slate-400 hover:text-white text-xs font-semibold transition-all bg-slate-950/20"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleSaveConcept}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/15"
                >
                  <Save className="h-3.5 w-3.5" /> Save Concept
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-850">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Concept Key (Unique reference)</label>
                    <HelpTooltip content="A unique snake_case identifier for this OKF concept. Used for binding in agent configurations. Cannot be changed after creation." side="right" />
                  </div>
                  <input 
                    type="text" 
                    value={formKey}
                    onChange={(e) => setFormKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                    placeholder="e.g. corporate_policy_anonymization" 
                    className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-655 outline-none focus:border-indigo-500 font-mono"
                    disabled={mode === "edit"}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Namespace Category</label>
                    <HelpTooltip content="A grouping label for organizing concepts (e.g. 'SOP Guidelines', 'Compliance Standard'). Displayed in the concept list." side="right" />
                  </div>
                  <input 
                    type="text" 
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="e.g. SOP Guidelines" 
                    className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-655 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Concept Type</label>
                  <select 
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full rounded-xl border border-slate-855 bg-[#0d0d18] py-2.5 px-4 text-xs text-white outline-none focus:border-indigo-500"
                  >
                    <option value="sop">SOP Ruleset</option>
                    <option value="guideline">Guideline Parameter</option>
                    <option value="compliance">Compliance Standard</option>
                    <option value="terminology">Shared Definition/Terminology</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Concept Title</label>
                  <input 
                    type="text" 
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Privacy Compliance Protocol" 
                    className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-655 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Resource URI / Anchor Link</label>
                  <input 
                    type="text" 
                    value={formResource}
                    onChange={(e) => setFormResource(e.target.value)}
                    placeholder="e.g. https://google.com/compliance/docs" 
                    className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-655 outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Tags (Comma-separated)</label>
                  <input 
                    type="text" 
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                    placeholder="e.g. pii, ssn, encryption, logic" 
                    className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-655 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Description Summary</label>
                  <HelpTooltip content="A short summary of the concept's purpose. Displayed in the concept viewer and used for quick reference." side="right" />
                  <AiAssistButton
                    onGenerated={(text) => setFormDesc(text)}
                    mode="summarize"
                    domain="okf-guideline"
                    placeholder="Describe the concept or paste existing content to summarize..."
                  />
                </div>
                <input 
                  type="text" 
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Summarize the core premise of this concept..." 
                  className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-655 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex-1 flex flex-col min-h-[300px]">
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Guidelines Body (Markdown)</label>
                  <HelpTooltip content="The full Markdown body of the concept. Supports standard Markdown syntax and YAML frontmatter parsing for type, title, description, resource, and tags." side="right" />
                  <AiAssistButton
                    onGenerated={(text) => setFormMarkdown(text)}
                    mode="all"
                    domain="okf-guideline"
                    placeholder="Describe the guidelines, policies, or documentation to generate..."
                  />
                </div>
                <textarea 
                  rows={12} 
                  value={formMarkdown}
                  onChange={(e) => setFormMarkdown(e.target.value)}
                  placeholder="Write the full documentation here..." 
                  className="flex-1 w-full rounded-xl border border-slate-855 bg-[#05050a] p-4 text-xs text-slate-300 font-mono outline-none resize-none focus:border-indigo-500 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-855"
                />
              </div>
            </div>
          </div>
        ) : (
          /* EMPTY STATE */
          <div className="flex-1 flex flex-col items-center justify-center text-slate-650 text-xs py-24 gap-3">
            <FileText className="h-10 w-10 text-slate-800" />
            <div className="text-center space-y-1">
              <span className="font-bold text-slate-400 block">No Concept Bundle Selected</span>
              <p className="text-slate-500 text-[10px]">Select a Google OKF concept from the left-side index to preview or modify.</p>
            </div>
          </div>
        )}
      </div>

      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-200">
          <div onClick={() => setDeletingId(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Delete Concept Bundle</h3>
              <button onClick={() => setDeletingId(null)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-200 mb-6 leading-relaxed">
              Are you sure you want to delete this concept bundle? This action is permanent and cannot be undone.
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
                  handleDeleteConcept(deletingId);
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
