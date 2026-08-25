"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { 
  Plus, 
  Trash2, 
  Loader2, 
  BookOpen, 
  Upload, 
  Download,
  Code, 
  Link as LinkIcon, 
  Save, 
  Edit,
  FileText,
  X,
  Search,
  Copy,
  Check,
  FolderOpen,
  Wrench,
  Eye,
  Sparkles
} from "lucide-react";
import { HelpTooltip } from "@/components/shared/help-tooltip";
import { AiAssistButton } from "@/components/shared/ai-assist-button";

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  category: "open" | "native" | "mcp" | "custom";
  mcpServerId?: string;
  version: string;
  createdAt?: string;
  updatedAt?: string;
}

export function SkillsRegistry() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingSkill, setDeletingSkill] = useState<Skill | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  
  // Search, Filter & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"updated" | "name" | "category">("updated");

  // Modal states
  const [viewingSkill, setViewingSkill] = useState<Skill | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isAuthorModalOpen, setIsAuthorModalOpen] = useState(false);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [activeExportMenuId, setActiveExportMenuId] = useState<string | null>(null);

  // Ingest tab state
  const [ingestTab, setIngestTab] = useState<"file" | "paste" | "url">("file");
  const [rawMarkdown, setRawMarkdown] = useState("");
  const [fetchUrl, setFetchUrl] = useState("");
  const [importing, setImporting] = useState(false);

  // Author / Edit Form State
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formInstructions, setFormInstructions] = useState("");
  const [formCategory, setFormCategory] = useState<Skill["category"]>("custom");
  const [formMcpServerId, setFormMcpServerId] = useState("");
  const [formVersion, setFormVersion] = useState("1.0.0");

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/skills");
      if (res.ok) {
        const data = await res.json();
        setSkills(data.skills || []);
      }
    } catch (err) {
      console.error("Failed to fetch skills:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  useEffect(() => {
    if (alertMessage) {
      const t = setTimeout(() => setAlertMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [alertMessage]);

  // Open Author Modal
  const handleOpenAuthorModal = () => {
    setFormName("");
    setFormDesc("");
    setFormInstructions("");
    setFormCategory("custom");
    setFormMcpServerId("");
    setFormVersion("1.0.0");
    setEditingSkill(null);
    setIsAuthorModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (skill: Skill) => {
    setEditingSkill(skill);
    setFormName(skill.name);
    setFormDesc(skill.description);
    setFormInstructions(skill.instructions);
    setFormCategory(skill.category);
    setFormMcpServerId(skill.mcpServerId || "");
    setFormVersion(skill.version);
    setViewingSkill(null);
    setIsAuthorModalOpen(true);
  };

  // Filter and sort skills
  const filteredSkills = useMemo(() => {
    return skills.filter(skill => {
      const matchesSearch = 
        !searchQuery.trim() ||
        skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (skill.mcpServerId && skill.mcpServerId.toLowerCase().includes(searchQuery.toLowerCase())) ||
        skill.instructions.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = 
        selectedCategoryFilter === "All" ||
        skill.category === selectedCategoryFilter;

      return matchesSearch && matchesCategory;
    }).sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "category") {
        return a.category.localeCompare(b.category);
      }
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [skills, searchQuery, selectedCategoryFilter, sortBy]);

  const parseSkillMarkdown = (content: string) => {
    const fmRegex = /^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(fmRegex);
    if (match) {
      const fmText = match[1];
      const body = match[2];
      const metadata: Record<string, string> = {};
      fmText.split("\n").forEach(line => {
        const parts = line.split(":");
        if (parts.length >= 2) {
          metadata[parts[0].trim()] = parts.slice(1).join(":").trim().replace(/^['"]|['"]$/g, "");
        }
      });
      return {
        name: metadata.name || "",
        description: metadata.description || "",
        instructions: body.trim() || content,
        category: (metadata.category as Skill["category"]) || "open",
        version: metadata.version || "1.0.0"
      };
    }
    return { name: "", description: "", instructions: content.trim(), category: "custom" as const, version: "1.0.0" };
  };

  const handleImportText = () => {
    if (!rawMarkdown) return;
    const parsed = parseSkillMarkdown(rawMarkdown);
    setFormName(parsed.name || "imported_skill");
    setFormDesc(parsed.description || "Skill imported from text");
    setFormInstructions(parsed.instructions);
    setFormCategory(parsed.category);
    setFormVersion(parsed.version);
    setRawMarkdown("");
    setIsIngestModalOpen(false);
    setEditingSkill(null);
    setIsAuthorModalOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const parsed = parseSkillMarkdown(text);
        setFormName(parsed.name || file.name.replace(/\.md$/i, "").toLowerCase().replace(/[^a-z0-9_]/g, "_"));
        setFormDesc(parsed.description || `Skill imported from ${file.name}`);
        setFormInstructions(parsed.instructions);
        setFormCategory(parsed.category);
        setFormVersion(parsed.version);
        setIsIngestModalOpen(false);
        setEditingSkill(null);
        setIsAuthorModalOpen(true);
      }
    };
    reader.readAsText(file);
  };

  const handleFetchUrl = async () => {
    if (!fetchUrl) return;
    setImporting(true);
    try {
      const res = await fetch(fetchUrl);
      if (res.ok) {
        const text = await res.text();
        const parsed = parseSkillMarkdown(text);
        setFormName(parsed.name || "fetched_skill");
        setFormDesc(parsed.description || `Skill fetched from ${fetchUrl}`);
        setFormInstructions(parsed.instructions);
        setFormCategory(parsed.category);
        setFormVersion(parsed.version);
        setFetchUrl("");
        setIsIngestModalOpen(false);
        setEditingSkill(null);
        setIsAuthorModalOpen(true);
      } else {
        setAlertMessage(`Failed to fetch URL: ${res.statusText}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setAlertMessage(`Error fetching URL: ${errMsg}`);
    } finally {
      setImporting(false);
    }
  };

  const handleSaveSkill = async () => {
    if (!formName || !formDesc || !formInstructions) {
      setAlertMessage("Name, description, and instructions are required.");
      return;
    }

    setLoading(true);
    try {
      if (!editingSkill) {
        // Create mode
        const res = await fetch("/api/skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            description: formDesc,
            instructions: formInstructions,
            category: formCategory,
            mcpServerId: formMcpServerId || null,
            version: formVersion
          }),
        });
        if (res.ok) {
          await fetchSkills();
          setIsAuthorModalOpen(false);
        } else {
          const err = await res.json();
          setAlertMessage(err.error || "Failed to save skill.");
        }
      } else {
        // Edit mode (increment patch version)
        const vParts = formVersion.split(".");
        let newVersion = formVersion;
        if (vParts.length === 3) {
          const patch = parseInt(vParts[2]) + 1;
          newVersion = `${vParts[0]}.${vParts[1]}.${patch}`;
        }

        const res = await fetch("/api/skills", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingSkill.id,
            name: formName,
            description: formDesc,
            instructions: formInstructions,
            category: formCategory,
            mcpServerId: formMcpServerId || null,
            version: newVersion
          }),
        });
        if (res.ok) {
          await fetchSkills();
          setIsAuthorModalOpen(false);
          setEditingSkill(null);
        } else {
          const err = await res.json();
          setAlertMessage(err.error || "Failed to update skill.");
        }
      }
    } catch (err) {
      console.error("Failed to save skill:", err);
      setAlertMessage("An unexpected error occurred while saving.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSkill = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/skills?id=${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await fetchSkills();
        setDeletingSkill(null);
        if (viewingSkill?.id === id) setViewingSkill(null);
      }
    } catch (err) {
      console.error("Failed to delete skill:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportMarkdown = (skill: Skill) => {
    const content = `---\nname: "${skill.name}"\ndescription: "${skill.description.replace(/"/g, '\\"')}"\ncategory: "${skill.category}"\nversion: "${skill.version}"\n${skill.mcpServerId ? `mcp_server_id: "${skill.mcpServerId}"\n` : ""}---\n\n${skill.instructions}`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${skill.name}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setActiveExportMenuId(null);
  };

  const handleExportJson = (skill: Skill) => {
    const exportObj = {
      name: skill.name,
      description: skill.description,
      category: skill.category,
      version: skill.version,
      mcpServerId: skill.mcpServerId || null,
      instructions: skill.instructions,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${skill.name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setActiveExportMenuId(null);
  };

  const handleCopyInstructions = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const renderBadge = (category: Skill["category"]) => {
    const classes = {
      open: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
      native: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      mcp: "bg-amber-500/10 text-amber-400 border-amber-500/30",
      custom: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border capitalize ${classes[category] || classes.custom}`}>
        {category === "custom" ? "Custom JS" : category === "native" ? "Native TS" : category === "open" ? "Open Agent" : "MCP Binded"}
      </span>
    );
  };

  const categoryFilterOptions = [
    { label: "All", value: "All" },
    { label: "Custom JS", value: "custom" },
    { label: "Native TS", value: "native" },
    { label: "Open Agent", value: "open" },
    { label: "MCP Binded", value: "mcp" }
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950/20 rounded-2xl border border-slate-900 overflow-hidden">
      {/* ── Top Header Controls Bar ── */}
      <div className="p-4 border-b border-slate-900 bg-slate-950/40 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        {/* Title & Counter */}
        <div className="flex items-center gap-3">
          <Wrench className="h-5 w-5 text-indigo-400" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Universal Skills Registry</h2>
              <HelpTooltip content="Universal Agent Skills define procedural knowledge, code execution routines, and dynamic MCP endpoints." side="right" />
            </div>
            <span className="text-[11px] text-slate-500">
              Total: <strong className="text-slate-300">{filteredSkills.length}</strong> skills persisted
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsIngestModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/50 hover:bg-slate-900 text-slate-300 hover:text-white text-xs font-semibold transition-all shadow-sm"
          >
            <Upload className="h-4 w-4 text-slate-400" /> Import / Ingest
          </button>
          <button
            type="button"
            onClick={handleOpenAuthorModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
          >
            <Plus className="h-4 w-4" /> Author New Skill
          </button>
        </div>
      </div>

      {/* ── Search, Filter & Sort Toolbar ── */}
      <div className="p-3.5 border-b border-slate-900 bg-slate-950/30 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
        {/* Real-time search */}
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills by name, description, server ID..."
            className="w-full rounded-xl border border-slate-850 bg-slate-900/50 py-1.5 pl-9 pr-8 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills and Sort dropdown */}
        <div className="flex items-center gap-3 overflow-x-auto">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 bg-slate-900/30 p-1 rounded-xl border border-slate-850">
            {categoryFilterOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedCategoryFilter(opt.value)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all border ${
                  selectedCategoryFilter === opt.value
                    ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300 shadow-sm"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-500">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-2.5 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="updated">Recently Updated</option>
              <option value="name">Name (A-Z)</option>
              <option value="category">Category</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Full-Width Data Table ── */}
      <div className="flex-1 overflow-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800">
        {loading && skills.length === 0 ? (
          <div className="flex flex-col justify-center items-center py-24 text-slate-500 text-xs gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            <span>Loading registered skills...</span>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="text-center py-24 px-4 space-y-3">
            <FolderOpen className="h-10 w-10 text-slate-700 mx-auto" />
            <p className="text-slate-300 text-sm font-semibold">
              {searchQuery || selectedCategoryFilter !== "All" ? "No skills match your search filters." : "No skills registered yet."}
            </p>
            <p className="text-slate-500 text-xs max-w-sm mx-auto">
              {searchQuery || selectedCategoryFilter !== "All" 
                ? "Try adjusting your query or resetting the category filter tab." 
                : "Author a new skill or import an existing SKILL.md bundle to get started."}
            </p>
            <button
              type="button"
              onClick={handleOpenAuthorModal}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-600/15"
            >
              <Plus className="h-4 w-4" /> Author New Skill
            </button>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-850 bg-slate-950/60 text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider">
                <th className="py-3 px-4">Skill Name &amp; Key</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Binding / Server ID</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {filteredSkills.map((skill) => (
                <tr 
                  key={skill.id}
                  className="group hover:bg-slate-900/30 transition-colors text-xs"
                >
                  {/* Name & Version */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-100 group-hover:text-indigo-300 transition-colors">
                        {skill.name}
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        v{skill.version}
                      </span>
                    </div>
                  </td>

                  {/* Category Badge */}
                  <td className="py-3.5 px-4">
                    {renderBadge(skill.category)}
                  </td>

                  {/* Binding / Server ID */}
                  <td className="py-3.5 px-4">
                    {skill.mcpServerId ? (
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-mono">
                        {skill.mcpServerId}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-[11px] font-mono">Local Sandbox</span>
                    )}
                  </td>

                  {/* Description */}
                  <td className="py-3.5 px-4 max-w-md">
                    <p className="text-slate-400 truncate text-[11px] leading-relaxed" title={skill.description}>
                      {skill.description}
                    </p>
                  </td>

                  {/* Actions Group */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Inspect/View */}
                      <button
                        type="button"
                        onClick={() => setViewingSkill(skill)}
                        className="p-1.5 rounded-lg border border-slate-850 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-850 text-slate-300 hover:text-white transition-all"
                        title="Inspect Blueprint"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>

                      {/* Edit */}
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(skill)}
                        className="p-1.5 rounded-lg border border-slate-850 hover:border-indigo-500/40 bg-slate-900/40 hover:bg-indigo-950/20 text-slate-300 hover:text-indigo-300 transition-all"
                        title="Edit Skill"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>

                      {/* Export Dropdown */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setActiveExportMenuId(activeExportMenuId === skill.id ? null : skill.id)}
                          className="p-1.5 rounded-lg border border-slate-850 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-850 text-slate-300 hover:text-white transition-all"
                          title="Export Options"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>

                        {activeExportMenuId === skill.id && (
                          <div className="absolute right-0 top-full mt-1 w-32 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl py-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                            <button
                              type="button"
                              onClick={() => handleExportMarkdown(skill)}
                              className="w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-900 flex items-center gap-2"
                            >
                              <FileText className="h-3.5 w-3.5 text-indigo-400" /> Export .md
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportJson(skill)}
                              className="w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-900 flex items-center gap-2"
                            >
                              <Code className="h-3.5 w-3.5 text-amber-400" /> Export JSON
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => setDeletingSkill(skill)}
                        className="p-1.5 rounded-lg border border-slate-850 hover:border-red-500/40 bg-slate-900/40 hover:bg-red-950/20 text-slate-400 hover:text-red-400 transition-all"
                        title="Delete Skill"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── 1. Ingestion Modal ── */}
      {isIngestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setIsIngestModalOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-900 flex justify-between items-center bg-slate-950/40">
              <div className="flex items-center gap-2.5">
                <Upload className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Import &amp; Ingest Skill</h3>
              </div>
              <button onClick={() => setIsIngestModalOpen(false)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Tab selector */}
              <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-850">
                <button
                  type="button"
                  onClick={() => setIngestTab("file")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    ingestTab === "file" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Upload SKILL.md File
                </button>
                <button
                  type="button"
                  onClick={() => setIngestTab("paste")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    ingestTab === "paste" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Paste Raw Markdown
                </button>
                <button
                  type="button"
                  onClick={() => setIngestTab("url")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    ingestTab === "url" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Fetch from URL
                </button>
              </div>

              {ingestTab === "file" && (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-500/30 hover:border-indigo-500/60 bg-indigo-950/10 hover:bg-indigo-950/20 rounded-2xl p-8 cursor-pointer transition-all">
                  <Upload className="h-8 w-8 text-indigo-400 mb-2" />
                  <span className="text-sm text-slate-200 font-bold">Drop SKILL.md Blueprint File</span>
                  <span className="text-xs text-slate-500 mt-1">Automatically hydrates YAML frontmatter and markdown instructions</span>
                  <input type="file" accept=".md" onChange={handleFileUpload} className="hidden" />
                </label>
              )}

              {ingestTab === "paste" && (
                <div className="space-y-3">
                  <textarea 
                    rows={8} 
                    value={rawMarkdown}
                    onChange={(e) => setRawMarkdown(e.target.value)}
                    placeholder="---\nname: my_custom_skill\ndescription: A useful agent tool\ncategory: custom\nversion: 1.0.0\n---\n\n# Instructions..."
                    className="w-full rounded-2xl border border-slate-850 bg-[#05050a] p-4 text-xs text-slate-300 font-mono placeholder-slate-655 outline-none focus:border-indigo-500"
                  />
                  <button 
                    type="button" 
                    onClick={handleImportText}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/15"
                  >
                    Parse &amp; Load Blueprint
                  </button>
                </div>
              )}

              {ingestTab === "url" && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={fetchUrl}
                      onChange={(e) => setFetchUrl(e.target.value)}
                      placeholder="e.g. https://skills.sh/shadcn/SKILL.md" 
                      className="flex-1 rounded-xl border border-slate-850 bg-slate-900/50 py-2 px-3.5 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
                    />
                    <button 
                      type="button" 
                      onClick={handleFetchUrl} 
                      disabled={importing}
                      className="px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                      Fetch
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">Provide an accessible raw markdown URL from GitHub, skills.sh, or an agent skill repository.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 2. View / Inspect Modal ── */}
      {viewingSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setViewingSkill(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-900 flex justify-between items-center bg-slate-950/40 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <BookOpen className="h-5 w-5 text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold font-mono text-white truncate">{viewingSkill.name}</h3>
                    {renderBadge(viewingSkill.category)}
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                      v{viewingSkill.version}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button 
                  type="button" 
                  onClick={() => handleExportMarkdown(viewingSkill)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/50 text-slate-300 hover:text-white text-xs font-semibold transition-all"
                  title="Download Markdown Blueprint"
                >
                  <Download className="h-3.5 w-3.5" /> .md
                </button>
                <button 
                  type="button" 
                  onClick={() => handleExportJson(viewingSkill)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/50 text-slate-300 hover:text-white text-xs font-semibold transition-all"
                  title="Download JSON Payload"
                >
                  <Download className="h-3.5 w-3.5" /> JSON
                </button>
                <button 
                  type="button" 
                  onClick={() => handleOpenEditModal(viewingSkill)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/15"
                >
                  <Edit className="h-3.5 w-3.5" /> Edit Skill
                </button>
                <button onClick={() => setViewingSkill(null)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-lg ml-2">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950/40 border border-slate-900 p-4 rounded-2xl text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">Category</span>
                  <span className="text-slate-200 capitalize font-medium">{viewingSkill.category}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">Version</span>
                  <span className="text-slate-200 font-mono font-medium">v{viewingSkill.version}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">Binding / Execution</span>
                  <span className="text-indigo-400 font-mono font-medium">{viewingSkill.mcpServerId || "Local Sandbox Function"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">Last Updated</span>
                  <span className="text-slate-300 font-medium">
                    {viewingSkill.updatedAt ? new Date(viewingSkill.updatedAt).toLocaleDateString() : "Just now"}
                  </span>
                </div>
              </div>

              {/* Description Card */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Description</span>
                <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/30 border border-slate-900 p-4 rounded-2xl">
                  {viewingSkill.description}
                </div>
              </div>

              {/* Instructions / SKILL.md Body */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Instructions &amp; Schema Blueprint (SKILL.md)</span>
                  <button
                    type="button"
                    onClick={() => handleCopyInstructions(viewingSkill.instructions)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors bg-slate-900/60 hover:bg-slate-900 px-3 py-1 rounded-lg border border-slate-800"
                  >
                    {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedCode ? "Copied" : "Copy Raw Instructions"}
                  </button>
                </div>
                <pre className="rounded-2xl border border-slate-900 bg-[#06060c] p-4 text-xs text-slate-300 font-mono overflow-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800 whitespace-pre-wrap leading-relaxed max-h-[350px]">
                  {viewingSkill.instructions}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. Author / Edit Modal ── */}
      {isAuthorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setIsAuthorModalOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-900 flex justify-between items-center bg-slate-950/40 shrink-0">
              <div className="flex items-center gap-2.5">
                <Edit className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  {editingSkill ? `Edit Skill: ${formName}` : "Create Custom Skill Definition"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsAuthorModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-850 text-slate-400 hover:text-white text-xs font-semibold transition-all bg-slate-950/20"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleSaveSkill}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/15 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {editingSkill ? "Publish & Increment Patch" : "Save Skill"}
                </button>
                <button onClick={() => setIsAuthorModalOpen(false)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-lg ml-2">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Skill Name (Unique Identifier)</label>
                    <HelpTooltip content="A unique, snake_case identifier for this skill. Used for programmatic binding in agent configurations. Cannot be changed after creation." side="right" />
                  </div>
                  <input 
                    type="text" 
                    value={formName}
                    onChange={(e) => setFormName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                    placeholder="e.g. compile_visual_canvas" 
                    className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500 font-mono disabled:opacity-60"
                    disabled={Boolean(editingSkill)}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Category</label>
                    <HelpTooltip content="Determines how the skill is executed: Custom (local JS), Open (YAML+Markdown), Native (TS system), or MCP (bound to a tool server)." side="right" />
                  </div>
                  <select 
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as Skill["category"])}
                    className="w-full rounded-xl border border-slate-850 bg-[#0d0d18] py-2.5 px-4 text-xs text-white outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="custom">Custom (Local JS Snippet)</option>
                    <option value="open">Open Agent Skill (YAML + Markdown Instructions)</option>
                    <option value="native">Native (TS System Executor)</option>
                    <option value="mcp">MCP Binded Tool</option>
                  </select>
                </div>
              </div>

              {formCategory === "mcp" && (
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">MCP Server Identifier</label>
                  <input 
                    type="text" 
                    value={formMcpServerId}
                    onChange={(e) => setFormMcpServerId(e.target.value)}
                    placeholder="e.g. StitchMCP or wedplanai-prod" 
                    className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Brief Summary / Description</label>
                  <HelpTooltip content="A one-sentence summary of what this skill does. Used for catalog browsing and quick identification." side="right" />
                  <AiAssistButton
                    onGenerated={(text) => setFormDesc(text)}
                    mode="generate"
                    domain="skill"
                    placeholder="Generate a description for a skill that..."
                  />
                </div>
                <input 
                  type="text" 
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Explain what this capability does in 1 sentence..." 
                  className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Instructions &amp; Schema body (SKILL.md Blueprint)</label>
                  <HelpTooltip content="The full skill definition in SKILL.md format — YAML frontmatter for metadata followed by Markdown instructions for agent consumption." side="right" />
                  <AiAssistButton
                    onGenerated={(text) => setFormInstructions(text)}
                    mode="all"
                    domain="skill"
                    placeholder="Describe the skill logic, tools, and behavior you want to define..."
                  />
                </div>
                <textarea 
                  rows={12} 
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  placeholder="# SKILL BLUEPRINT..." 
                  className="w-full rounded-2xl border border-slate-855 bg-[#05050a] p-4 text-xs text-slate-300 font-mono outline-none resize-none focus:border-indigo-500 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-855 leading-relaxed"
                />
              </div>
            </div>

            {/* Sticky Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-900 bg-slate-950/60 flex justify-end items-center gap-2.5 shrink-0">
              <button 
                type="button" 
                onClick={() => setIsAuthorModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-850 text-slate-400 hover:text-white text-xs font-semibold transition-all bg-slate-950/20"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleSaveSkill}
                disabled={loading}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/15 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingSkill ? "Publish & Increment Patch" : "Save Skill"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. Delete Confirmation Modal ── */}
      {deletingSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setDeletingSkill(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Delete Skill</h3>
              <button onClick={() => setDeletingSkill(null)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300 mb-6 leading-relaxed">
              Are you sure you want to delete <strong className="text-white font-mono">{deletingSkill.name}</strong>? This action is permanent and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeletingSkill(null)}
                className="flex-1 py-2 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-semibold bg-slate-900/40 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSkill(deletingSkill.id)}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all"
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
