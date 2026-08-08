"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Plus, 
  Trash2, 
  Loader2, 
  BookOpen, 
  Upload, 
  Code, 
  Link as LinkIcon, 
  Save, 
  Edit,
  FileText,
  X
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
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  
  // Form states for creating/editing
  const [editorMode, setEditorMode] = useState<"view" | "create" | "edit">("view");
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formInstructions, setFormInstructions] = useState("");
  const [formCategory, setFormCategory] = useState<Skill["category"]>("custom");
  const [formMcpServerId, setFormMcpServerId] = useState("");
  const [formVersion, setFormVersion] = useState("1.0.0");
  
  // Paste / upload helpers
  const [rawMarkdown, setRawMarkdown] = useState("");
  const [fetchUrl, setFetchUrl] = useState("");
  const [importing, setImporting] = useState(false);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSkills();
  }, [fetchSkills]);

  useEffect(() => {
    if (alertMessage) {
      const t = setTimeout(() => setAlertMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [alertMessage]);

  const handleSelectSkill = (skill: Skill) => {
    setActiveSkill(skill);
    setFormName(skill.name);
    setFormDesc(skill.description);
    setFormInstructions(skill.instructions);
    setFormCategory(skill.category);
    setFormMcpServerId(skill.mcpServerId || "");
    setFormVersion(skill.version);
    setEditorMode("view");
  };

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
    setEditorMode("create");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const parsed = parseSkillMarkdown(text);
        setFormName(parsed.name || file.name.replace(/\.md$/i, ""));
        setFormDesc(parsed.description || `Skill imported from ${file.name}`);
        setFormInstructions(parsed.instructions);
        setFormCategory(parsed.category);
        setFormVersion(parsed.version);
        setEditorMode("create");
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
        setEditorMode("create");
        setFetchUrl("");
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
      if (editorMode === "create") {
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
          setEditorMode("view");
          setActiveSkill(null);
        }
      } else if (editorMode === "edit" && activeSkill) {
        // Increment version on update
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
            id: activeSkill.id,
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
          setEditorMode("view");
          setActiveSkill(null);
        }
      }
    } catch (err) {
      console.error("Failed to save skill:", err);
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
        if (activeSkill?.id === id) {
          setActiveSkill(null);
          setEditorMode("view");
        }
      }
    } catch (err) {
      console.error("Failed to delete skill:", err);
    } finally {
      setLoading(false);
    }
  };

  const renderBadge = (category: Skill["category"]) => {
    const classes = {
      open: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
      native: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      mcp: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      custom: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    };
    return (
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border capitalize ${classes[category]}`}>
        {category}
      </span>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100vh-140px)] min-h-0">
      {/* Sidebar: Skills List & Import panel */}
      <div className="lg:col-span-1 border border-slate-900 bg-slate-950/20 rounded-2xl flex flex-col min-h-0 overflow-hidden">
        {/* Header toolbar */}
        <div className="px-5 py-4 border-b border-slate-900 bg-slate-950/40 flex justify-between items-center shrink-0">
          <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">Universal Skills Library <HelpTooltip content="Browse, create, and manage agent skill definitions. Skills define reusable capabilities that agents can invoke — from native JS snippets to MCP-bound tool sets." side="right" /></span>
          <button 
            type="button" 
            onClick={() => {
              setFormName("");
              setFormDesc("");
              setFormInstructions("");
              setFormCategory("custom");
              setFormMcpServerId("");
              setFormVersion("1.0.0");
              setEditorMode("create");
              setActiveSkill(null);
            }} 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-600/15"
          >
            <Plus className="h-3.5 w-3.5" /> Author New
          </button>
        </div>

        {/* Import Panel */}
        <div className="p-4 border-b border-slate-900 bg-slate-900/10 space-y-3 shrink-0">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Import &amp; Ingest Skills</span>
          
          <div className="grid grid-cols-2 gap-2">
            {/* Drag & drop file trigger */}
            <label className="flex flex-col items-center justify-center border border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/30 hover:bg-slate-950/50 rounded-xl p-2 cursor-pointer transition-all">
              <Upload className="h-4 w-4 text-slate-400 mb-1" />
              <span className="text-[10px] text-slate-400 font-semibold">SKILL.md File</span>
              <input type="file" accept=".md" onChange={handleFileUpload} className="hidden" />
            </label>

            {/* Paste panel option */}
            <button 
              type="button" 
              onClick={() => setEditorMode("view")} 
              className="flex flex-col items-center justify-center border border-slate-900 bg-slate-950/30 hover:bg-slate-950/50 rounded-xl p-2 transition-all"
            >
              <Code className="h-4 w-4 text-slate-400 mb-1" />
              <span className="text-[10px] text-slate-400 font-semibold">Paste raw markdown</span>
            </button>
          </div>

          {/* Paste Input Area */}
          {editorMode === "view" && !activeSkill && (
            <div className="space-y-2">
              <textarea 
                rows={3} 
                value={rawMarkdown}
                onChange={(e) => setRawMarkdown(e.target.value)}
                placeholder="Paste SKILL.md contents containing YAML frontmatter..."
                className="w-full rounded-xl border border-slate-900 bg-slate-950 p-2 text-[10px] text-white font-mono placeholder-slate-650 outline-none"
              />
              <button 
                type="button" 
                onClick={handleImportText}
                className="w-full py-1.5 rounded-xl border border-slate-850 hover:border-slate-750 bg-slate-900/50 hover:bg-slate-900 text-[10px] font-semibold text-slate-300 transition-all"
              >
                Parse &amp; Load Paste
              </button>
            </div>
          )}

          {/* URL fetcher */}
          <div className="flex gap-2">
            <input 
              type="text" 
              value={fetchUrl}
              onChange={(e) => setFetchUrl(e.target.value)}
              placeholder="Fetch from URL (e.g. skills.sh/...)" 
              className="flex-1 rounded-xl border border-slate-850 bg-slate-950 py-1.5 px-3 text-xs text-white placeholder-slate-650"
            />
            <button 
              type="button" 
              onClick={handleFetchUrl} 
              disabled={importing}
              className="px-3 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-850 text-xs font-semibold shrink-0"
            >
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LinkIcon className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-850">
          {loading && skills.length === 0 ? (
            <div className="flex justify-center items-center py-12 text-slate-500 text-xs gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading Skills...
            </div>
          ) : skills.length === 0 ? (
            <p className="text-center text-slate-500 text-xs py-12">No skills registered. Author a new skill to get started.</p>
          ) : (
            skills.map((skill) => (
              <div 
                key={skill.id}
                onClick={() => handleSelectSkill(skill)}
                className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                  activeSkill?.id === skill.id 
                    ? "bg-indigo-500/10 border-indigo-500/30 text-white" 
                    : "border-slate-900 bg-slate-950/20 hover:border-slate-800"
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-200 truncate">{skill.name}</span>
                    {renderBadge(skill.category)}
                  </div>
                  <p className="text-[10px] text-slate-500 truncate">{skill.description}</p>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-[9px] font-mono text-slate-650">v{skill.version}</span>
                  <button 
                    type="button" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingId(skill.id);
                    }}
                    className="p-1 rounded hover:bg-red-500/15 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete skill"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Panel: Editor & View Area */}
      <div className="lg:col-span-2 border border-slate-900 bg-slate-950/20 rounded-2xl flex flex-col min-h-0 overflow-hidden relative">
        {editorMode === "view" && activeSkill ? (
          /* VIEW MODE */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Toolbar */}
            <div className="px-6 py-4 border-b border-slate-900 bg-slate-950/40 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <BookOpen className="h-4 w-4 text-indigo-400" />
                <div>
                  <h4 className="text-sm font-bold text-white">{activeSkill.name}</h4>
                  <p className="text-[10px] text-slate-500">Holistic agent instructions and schema blueprint details</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setEditorMode("edit")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/50 text-slate-350 hover:text-white text-xs font-semibold transition-all"
              >
                <Edit className="h-3.5 w-3.5" /> Edit &amp; Version-Up
              </button>
            </div>

            {/* Details panel */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-850">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950/40 border border-slate-900 p-4 rounded-2xl text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">Category</span>
                  <span className="text-slate-200 capitalize font-medium">{activeSkill.category}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">Version</span>
                  <span className="text-slate-200 font-mono font-medium">v{activeSkill.version}</span>
                </div>
                {activeSkill.mcpServerId && (
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">MCP Server</span>
                    <span className="text-slate-200 font-mono font-medium">{activeSkill.mcpServerId}</span>
                  </div>
                )}
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">Last Updated</span>
                  <span className="text-slate-200 font-medium">
                    {activeSkill.updatedAt ? new Date(activeSkill.updatedAt).toLocaleDateString() : "Just now"}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Description</span>
                <p className="text-sm text-slate-300 leading-relaxed bg-slate-950/20 border border-slate-900 p-4 rounded-2xl">{activeSkill.description}</p>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Instructions &amp; Schema body (SKILL.md)</span>
                <pre className="flex-1 rounded-2xl border border-slate-900 bg-[#06060c] p-4 text-[11px] text-slate-300 font-mono overflow-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-850">
                  {activeSkill.instructions}
                </pre>
              </div>
            </div>
          </div>
        ) : editorMode === "create" || editorMode === "edit" ? (
          /* CREATE / EDIT MODE */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Toolbar */}
            <div className="px-6 py-4 border-b border-slate-900 bg-slate-950/40 flex justify-between items-center shrink-0">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                {editorMode === "create" ? "Create Custom Skill Definition" : `Edit Skill: ${formName}`}
              </span>
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={() => setEditorMode("view")}
                  className="px-3 py-1.5 rounded-xl border border-slate-850 text-slate-400 hover:text-white text-xs font-semibold transition-all bg-slate-950/20"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleSaveSkill}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/15"
                >
                  <Save className="h-3.5 w-3.5" /> {editorMode === "create" ? "Save Skill" : "Publish & Increment Patch"}
                </button>
              </div>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-850">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Skill Name (Unique Identifier)</label>
                    <HelpTooltip content="A unique, snake_case identifier for this skill. Used for programmatic binding in agent configurations. Cannot be changed after creation." side="right" />
                  </div>
                  <input 
                    type="text" 
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. compile_visual_canvas" 
                    className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
                    disabled={editorMode === "edit"}
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
                    className="w-full rounded-xl border border-slate-850 bg-[#0e0e1a] py-2.5 px-4 text-xs text-white outline-none focus:border-indigo-500"
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
                    placeholder="e.g. StitchMCP or context7" 
                    className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Brief Summary/Description</label>
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

              <div className="flex-1 flex flex-col min-h-[300px]">
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
                  rows={15} 
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  placeholder="# SKILL BLUEPRINT..." 
                  className="flex-1 w-full rounded-xl border border-slate-850 bg-[#06060b] p-4 text-xs text-slate-300 font-mono outline-none resize-none focus:border-indigo-500 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-850"
                />
              </div>
            </div>
          </div>
        ) : (
          /* EMPTY STATE */
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600 text-xs py-24 gap-3">
            <FileText className="h-10 w-10 text-slate-800" />
            <div className="text-center space-y-1">
              <span className="font-bold text-slate-200 block">No Active Skill Selected</span>
              <p className="text-slate-300 text-[10px]">Pick a skill from the catalog on the left to configure or inspect it.</p>
            </div>
          </div>
        )}
      </div>

      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-200">
          <div onClick={() => setDeletingId(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Delete Skill</h3>
              <button onClick={() => setDeletingId(null)} className="text-slate-505 hover:text-white p-1 hover:bg-slate-900 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-200 mb-6 leading-relaxed">
              Are you sure you want to delete this skill? This action is permanent and cannot be undone.
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
                  handleDeleteSkill(deletingId);
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
