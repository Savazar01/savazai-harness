"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  X,
  Search,
  ExternalLink,
  Copy,
  Check,
  FolderOpen,
  Layers,
  Eye,
  Code
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

export interface ParsedOkfConcept {
  conceptKey: string;
  category: string;
  conceptType: string;
  title: string;
  description: string;
  resource: string;
  tags: string[];
  markdownBody: string;
}

/**
 * Normalizes concept types to 4 canonical categories
 */
export function normalizeConceptType(typeStr?: string | null): string {
  if (!typeStr) return "SOP Ruleset";
  const lower = String(typeStr).toLowerCase().trim();
  if (lower.includes("sop") || lower.includes("standard operating")) return "SOP Ruleset";
  if (lower.includes("guideline") || lower.includes("parameter") || lower.includes("rule")) return "Guideline Parameter";
  if (lower.includes("compliance") || lower.includes("standard") || lower.includes("safety") || lower.includes("security")) return "Compliance Standard";
  if (lower.includes("definition") || lower.includes("terminology") || lower.includes("glossary") || lower.includes("shared")) return "Shared Definition/Terminology";
  return "SOP Ruleset";
}

/**
 * Parses YAML frontmatter and Markdown body defensively
 */
export function parseOkfFrontmatterAndBody(yamlFrontmatter?: string | null, markdownBody?: string | null): ParsedOkfConcept {
  const meta: Record<string, any> = {};
  
  if (yamlFrontmatter && typeof yamlFrontmatter === "string") {
    const cleanFm = yamlFrontmatter.replace(/^---\r?\n?/, "").replace(/\r?\n?---$/, "");
    cleanFm.split("\n").forEach(line => {
      const parts = line.split(":");
      if (parts.length >= 2) {
        const key = parts[0].trim().toLowerCase();
        const val = parts.slice(1).join(":").trim();
        if (val.startsWith("[") && val.endsWith("]")) {
          meta[key] = val.slice(1, -1).split(",").map((v: string) => v.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
        } else {
          meta[key] = val.replace(/^['"]|['"]$/g, "");
        }
      }
    });
  }

  let cleanBody = markdownBody && typeof markdownBody === "string" ? markdownBody : "";
  const bodyFmMatch = cleanBody.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/);
  if (bodyFmMatch) {
    const fmText = bodyFmMatch[1];
    cleanBody = bodyFmMatch[2].trim();
    fmText.split("\n").forEach(line => {
      const parts = line.split(":");
      if (parts.length >= 2) {
        const key = parts[0].trim().toLowerCase();
        const val = parts.slice(1).join(":").trim();
        if (!meta[key]) {
          if (val.startsWith("[") && val.endsWith("]")) {
            meta[key] = val.slice(1, -1).split(",").map((v: string) => v.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
          } else {
            meta[key] = val.replace(/^['"]|['"]$/g, "");
          }
        }
      }
    });
  }

  const typeVal = meta.type || meta.concepttype || meta.concept_type || "SOP Ruleset";
  const titleVal = meta.title || meta.concepttitle || meta.concept_title || "";
  const descVal = meta.description || meta.summary || meta.descriptionsummary || meta.description_summary || "";
  const resourceVal = meta.resource || meta.resourceuri || meta.resource_uri || meta.url || meta.link || "";
  
  let tagsList: string[] = [];
  if (Array.isArray(meta.tags)) {
    tagsList = meta.tags.map(t => String(t).trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  } else if (typeof meta.tags === "string" && meta.tags.trim()) {
    tagsList = meta.tags.split(",").map(t => t.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  }

  return {
    conceptKey: "",
    category: "",
    conceptType: normalizeConceptType(typeVal),
    title: Array.isArray(titleVal) ? String(titleVal[0] || "") : String(titleVal || ""),
    description: Array.isArray(descVal) ? String(descVal[0] || "") : String(descVal || ""),
    resource: Array.isArray(resourceVal) ? String(resourceVal[0] || "") : String(resourceVal || ""),
    tags: tagsList,
    markdownBody: cleanBody.trim()
  };
}

/**
 * Serializes fields into valid YAML frontmatter
 */
export function serializeOkfFrontmatter(params: {
  conceptType: string;
  title: string;
  description: string;
  resource?: string;
  tags?: string[];
}): string {
  const typeSlugMap: Record<string, string> = {
    "SOP Ruleset": "sop",
    "Guideline Parameter": "guideline",
    "Compliance Standard": "compliance",
    "Shared Definition/Terminology": "terminology"
  };
  const typeSlug = typeSlugMap[params.conceptType] || "sop";
  const tagsFormatted = Array.isArray(params.tags) && params.tags.length > 0 
    ? `[${params.tags.map(t => `"${String(t).trim().replace(/"/g, '\\"')}"`).join(", ")}]`
    : "[]";

  return `type: "${typeSlug}"\ntitle: "${(params.title || "").replace(/"/g, '\\"')}"\ndescription: "${(params.description || "").replace(/"/g, '\\"')}"\nresource: "${(params.resource || "").replace(/"/g, '\\"')}"\ntags: ${tagsFormatted}\ntimestamp: "${new Date().toISOString()}"`;
}

export function OkfRegistry() {
  const [concepts, setConcepts] = useState<OkfConcept[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingConcept, setDeletingConcept] = useState<OkfConcept | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"updated" | "title" | "type" | "namespace">("updated");

  const [viewingConcept, setViewingConcept] = useState<OkfConcept | null>(null);
  const [editingConcept, setEditingConcept] = useState<OkfConcept | null>(null);
  const [isAuthorModalOpen, setIsAuthorModalOpen] = useState(false);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [activeExportMenuId, setActiveExportMenuId] = useState<string | null>(null);

  const [rawBundleMarkdown, setRawBundleMarkdown] = useState("");

  const [formKey, setFormKey] = useState("");
  const [formCategory, setFormCategory] = useState("General Policy");
  const [formType, setFormType] = useState("SOP Ruleset");
  const [formTitle, setFormTitle] = useState("");
  const [formResource, setFormResource] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formMarkdown, setFormMarkdown] = useState("");

  const fetchConcepts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/okf");
      if (res.ok) {
        const data = await res.json();
        setConcepts(Array.isArray(data.concepts) ? data.concepts : []);
      }
    } catch (err) {
      console.error("Failed to fetch OKF concepts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConcepts();
  }, [fetchConcepts]);

  useEffect(() => {
    if (alertMessage) {
      const t = setTimeout(() => setAlertMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [alertMessage]);

  const handleOpenAuthorModal = () => {
    setFormKey("");
    setFormCategory("General Policy");
    setFormType("SOP Ruleset");
    setFormTitle("");
    setFormResource("");
    setFormTags("");
    setFormDescription("");
    setFormMarkdown("");
    setEditingConcept(null);
    setIsAuthorModalOpen(true);
  };

  const handleOpenEditModal = (concept: OkfConcept) => {
    setEditingConcept(concept);
    const parsed = parseOkfFrontmatterAndBody(concept.yamlFrontmatter, concept.markdownBody);
    setFormKey(concept.conceptKey || "");
    setFormCategory(concept.category || "General Policy");
    setFormType(parsed.conceptType);
    setFormTitle(parsed.title || concept.conceptKey || "");
    setFormResource(parsed.resource || "");
    setFormTags(Array.isArray(parsed.tags) ? parsed.tags.join(", ") : "");
    setFormDescription(parsed.description || "");
    setFormMarkdown(parsed.markdownBody || concept.markdownBody || "");
    setViewingConcept(null);
    setIsAuthorModalOpen(true);
  };

  const filteredConcepts = useMemo(() => {
    if (!Array.isArray(concepts)) return [];
    
    return concepts.map(concept => {
      const parsed = parseOkfFrontmatterAndBody(concept.yamlFrontmatter, concept.markdownBody);
      return {
        ...concept,
        parsed
      };
    }).filter(item => {
      const q = (searchQuery || "").toLowerCase().trim();
      if (!q) {
        return selectedTypeFilter === "All" || item.parsed.conceptType === selectedTypeFilter;
      }

      const matchesSearch = 
        (item.conceptKey || "").toLowerCase().includes(q) ||
        (item.category || "").toLowerCase().includes(q) ||
        (item.parsed.title || "").toLowerCase().includes(q) ||
        (item.parsed.description || "").toLowerCase().includes(q) ||
        (item.parsed.conceptType || "").toLowerCase().includes(q) ||
        (item.parsed.markdownBody || "").toLowerCase().includes(q) ||
        (Array.isArray(item.parsed.tags) && item.parsed.tags.some(t => String(t || "").toLowerCase().includes(q)));

      const matchesType = 
        selectedTypeFilter === "All" ||
        item.parsed.conceptType === selectedTypeFilter;

      return matchesSearch && matchesType;
    }).sort((a, b) => {
      if (sortBy === "title") {
        const titleA = a.parsed.title || a.conceptKey || "";
        const titleB = b.parsed.title || b.conceptKey || "";
        return titleA.localeCompare(titleB);
      }
      if (sortBy === "type") {
        const typeA = a.parsed.conceptType || "";
        const typeB = b.parsed.conceptType || "";
        return typeA.localeCompare(typeB);
      }
      if (sortBy === "namespace") {
        const catA = a.category || "";
        const catB = b.category || "";
        return catA.localeCompare(catB);
      }
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [concepts, searchQuery, selectedTypeFilter, sortBy]);

  const handleSaveConcept = async () => {
    if (!formKey.trim() || !formMarkdown.trim()) {
      setAlertMessage("Concept key and guidelines markdown body are required.");
      return;
    }

    setLoading(true);
    try {
      const tagsArray = formTags
        .split(",")
        .map(t => t.trim().replace(/^#/, ""))
        .filter(Boolean);

      const generatedFrontmatter = serializeOkfFrontmatter({
        conceptType: formType,
        title: formTitle || formKey,
        description: formDescription,
        resource: formResource,
        tags: tagsArray
      });

      if (!editingConcept) {
        const res = await fetch("/api/okf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: formCategory || "General Policy",
            conceptKey: formKey.trim(),
            yamlFrontmatter: generatedFrontmatter,
            markdownBody: formMarkdown,
          }),
        });

        if (res.ok) {
          await fetchConcepts();
          setIsAuthorModalOpen(false);
        } else {
          const err = await res.json();
          setAlertMessage(err.error || "Failed to persist OKF concept.");
        }
      } else {
        const res = await fetch("/api/okf", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingConcept.id,
            category: formCategory || "General Policy",
            conceptKey: formKey.trim(),
            yamlFrontmatter: generatedFrontmatter,
            markdownBody: formMarkdown,
          }),
        });

        if (res.ok) {
          await fetchConcepts();
          setIsAuthorModalOpen(false);
          setEditingConcept(null);
        } else {
          const err = await res.json();
          setAlertMessage(err.error || "Failed to update OKF concept.");
        }
      }
    } catch (err) {
      console.error("Failed to persist OKF concept:", err);
      setAlertMessage("An unexpected error occurred while saving.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConcept = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/okf?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchConcepts();
        setDeletingConcept(null);
        if (viewingConcept?.id === id) setViewingConcept(null);
      }
    } catch (err) {
      console.error("Failed to delete concept:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportMarkdown = (concept: OkfConcept) => {
    const parsed = parseOkfFrontmatterAndBody(concept.yamlFrontmatter, concept.markdownBody);
    const fullYaml = serializeOkfFrontmatter({
      conceptType: parsed.conceptType,
      title: parsed.title || concept.conceptKey,
      description: parsed.description,
      resource: parsed.resource,
      tags: parsed.tags
    });
    const content = `---\n${fullYaml}\n---\n\n${parsed.markdownBody || concept.markdownBody}`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${concept.conceptKey}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setActiveExportMenuId(null);
  };

  const handleExportJson = (concept: OkfConcept) => {
    const parsed = parseOkfFrontmatterAndBody(concept.yamlFrontmatter, concept.markdownBody);
    const exportObj = {
      conceptKey: concept.conceptKey,
      category: concept.category,
      conceptType: parsed.conceptType,
      title: parsed.title || concept.conceptKey,
      description: parsed.description,
      resource: parsed.resource,
      tags: parsed.tags,
      markdownBody: parsed.markdownBody || concept.markdownBody,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${concept.conceptKey}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setActiveExportMenuId(null);
  };

  const handleCopyMarkdown = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleIngestFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const parsed = parseOkfFrontmatterAndBody(text, "");
        const derivedKey = file.name.replace(/\.md$/i, "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
        setFormKey(derivedKey);
        setFormCategory("Imported SOP");
        setFormType(parsed.conceptType);
        setFormTitle(parsed.title || derivedKey);
        setFormDescription(parsed.description || `Imported guidelines from ${file.name}`);
        setFormResource(parsed.resource || "");
        setFormTags(Array.isArray(parsed.tags) ? parsed.tags.join(", ") : "");
        setFormMarkdown(parsed.markdownBody || text);
        setIsIngestModalOpen(false);
        setEditingConcept(null);
        setIsAuthorModalOpen(true);
      }
    };
    reader.readAsText(file);
  };

  const handleParseRawBundle = () => {
    if (!rawBundleMarkdown) return;
    const parsed = parseOkfFrontmatterAndBody(rawBundleMarkdown, "");
    setFormKey("imported_okf_concept");
    setFormCategory("Imported SOP");
    setFormType(parsed.conceptType);
    setFormTitle(parsed.title || "Imported OKF Concept");
    setFormDescription(parsed.description || "Imported policy guidelines");
    setFormResource(parsed.resource || "");
    setFormTags(Array.isArray(parsed.tags) ? parsed.tags.join(", ") : "");
    setFormMarkdown(parsed.markdownBody || rawBundleMarkdown);
    setRawBundleMarkdown("");
    setIsIngestModalOpen(false);
    setEditingConcept(null);
    setIsAuthorModalOpen(true);
  };

  const renderTypeBadge = (conceptType: string) => {
    const classes: Record<string, string> = {
      "SOP Ruleset": "bg-blue-500/10 text-blue-400 border-blue-500/30",
      "Guideline Parameter": "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      "Compliance Standard": "bg-amber-500/10 text-amber-400 border-amber-500/30",
      "Shared Definition/Terminology": "bg-purple-500/10 text-purple-400 border-purple-500/30",
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${classes[conceptType] || classes["SOP Ruleset"]}`}>
        {conceptType}
      </span>
    );
  };

  const typeFilterOptions = [
    { label: "All", value: "All" },
    { label: "SOP Ruleset", value: "SOP Ruleset" },
    { label: "Guideline Parameter", value: "Guideline Parameter" },
    { label: "Compliance Standard", value: "Compliance Standard" },
    { label: "Shared Definition", value: "Shared Definition/Terminology" }
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950/20 rounded-2xl border border-slate-900 overflow-hidden">
      <div className="p-4 border-b border-slate-900 bg-slate-950/40 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-indigo-400" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Google OKF Concepts</h2>
              <HelpTooltip content="Open Knowledge Framework (OKF) concepts provide structured SOPs, parameters, and compliance rules that workers ingest at runtime." side="right" />
            </div>
            <span className="text-[11px] text-slate-500">
              Total: <strong className="text-slate-300">{filteredConcepts.length}</strong> concepts persisted
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsIngestModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/50 hover:bg-slate-900 text-slate-300 hover:text-white text-xs font-semibold transition-all shadow-sm"
          >
            <Upload className="h-4 w-4 text-slate-400" /> Ingest Bundle
          </button>
          <button
            type="button"
            onClick={handleOpenAuthorModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
          >
            <Plus className="h-4 w-4" /> + New Concept
          </button>
        </div>
      </div>

      <div className="p-3.5 border-b border-slate-900 bg-slate-950/30 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by key, title, tags, summary, namespace..."
            className="w-full rounded-xl border border-slate-855 bg-slate-900/50 py-1.5 pl-9 pr-8 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
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

        <div className="flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center gap-1.5 bg-slate-900/30 p-1 rounded-xl border border-slate-850">
            {typeFilterOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedTypeFilter(opt.value)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all border ${
                  selectedTypeFilter === opt.value
                    ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300 shadow-sm"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-500">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-2.5 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="updated">Recently Updated</option>
              <option value="title">Title (A-Z)</option>
              <option value="type">Concept Type</option>
              <option value="namespace">Namespace Category</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800">
        {loading && concepts.length === 0 ? (
          <div className="flex flex-col justify-center items-center py-24 text-slate-500 text-xs gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            <span>Loading OKF concept library...</span>
          </div>
        ) : filteredConcepts.length === 0 ? (
          <div className="text-center py-24 px-4 space-y-3">
            <FolderOpen className="h-10 w-10 text-slate-700 mx-auto" />
            <p className="text-slate-300 text-sm font-semibold">
              {searchQuery || selectedTypeFilter !== "All" ? "No OKF concepts match your search filters." : "No concepts registered yet."}
            </p>
            <p className="text-slate-500 text-xs max-w-sm mx-auto">
              {searchQuery || selectedTypeFilter !== "All" 
                ? "Try adjusting your search keywords or resetting the type filter." 
                : "Author a new concept bundle or drop an existing policy .md file."}
            </p>
            <button
              type="button"
              onClick={handleOpenAuthorModal}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-600/15"
            >
              <Plus className="h-4 w-4" /> Author New Concept
            </button>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-850 bg-slate-950/60 text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider">
                <th className="py-3 px-4">Concept Title &amp; Key</th>
                <th className="py-3 px-4">Concept Type</th>
                <th className="py-3 px-4">Namespace Category</th>
                <th className="py-3 px-4">Tags</th>
                <th className="py-3 px-4">Description Summary</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {filteredConcepts.map((item) => (
                <tr 
                  key={item.id}
                  className="group hover:bg-slate-900/30 transition-colors text-xs"
                >
                  <td className="py-3.5 px-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-slate-100 group-hover:text-indigo-300 transition-colors">
                        {item.parsed.title || item.conceptKey}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {item.conceptKey}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    {renderTypeBadge(item.parsed.conceptType)}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 font-medium">
                      {item.category || "General Policy"}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 max-w-[200px]">
                    <div className="flex flex-wrap gap-1">
                      {Array.isArray(item.parsed.tags) && item.parsed.tags.length > 0 ? (
                        <>
                          {item.parsed.tags.slice(0, 2).map((tag, idx) => (
                            <span key={idx} className="text-[9px] bg-slate-900/80 text-slate-400 px-1.5 py-0.5 rounded border border-slate-850">
                              #{tag}
                            </span>
                          ))}
                          {item.parsed.tags.length > 2 && (
                            <span className="text-[9px] text-slate-500 font-mono self-center">
                              +{item.parsed.tags.length - 2}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-600 text-[10px]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 max-w-xs">
                    <p className="text-slate-400 truncate text-[11px] leading-relaxed" title={item.parsed.description}>
                      {item.parsed.description || "No description summary provided."}
                    </p>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setViewingConcept(item)}
                        className="p-1.5 rounded-lg border border-slate-850 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-850 text-slate-300 hover:text-white transition-all"
                        title="View Document"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(item)}
                        className="p-1.5 rounded-lg border border-slate-850 hover:border-indigo-500/40 bg-slate-900/40 hover:bg-indigo-950/20 text-slate-300 hover:text-indigo-300 transition-all"
                        title="Edit Concept"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setActiveExportMenuId(activeExportMenuId === item.id ? null : item.id)}
                          className="p-1.5 rounded-lg border border-slate-850 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-850 text-slate-300 hover:text-white transition-all"
                          title="Export Options"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        {activeExportMenuId === item.id && (
                          <div className="absolute right-0 top-full mt-1 w-32 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl py-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                            <button
                              type="button"
                              onClick={() => handleExportMarkdown(item)}
                              className="w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-900 flex items-center gap-2"
                            >
                              <FileText className="h-3.5 w-3.5 text-indigo-400" /> Export .md
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportJson(item)}
                              className="w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-900 flex items-center gap-2"
                            >
                              <Code className="h-3.5 w-3.5 text-amber-400" /> Export JSON
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeletingConcept(item)}
                        className="p-1.5 rounded-lg border border-slate-850 hover:border-red-500/40 bg-slate-900/40 hover:bg-red-950/20 text-slate-400 hover:text-red-400 transition-all"
                        title="Delete Concept"
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

      {isIngestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setIsIngestModalOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-900 flex justify-between items-center bg-slate-950/40">
              <div className="flex items-center gap-2.5">
                <Upload className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Ingest OKF Concept Bundle</h3>
              </div>
              <button onClick={() => setIsIngestModalOpen(false)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-500/30 hover:border-indigo-500/60 bg-indigo-950/10 hover:bg-indigo-950/20 rounded-2xl p-8 cursor-pointer transition-all">
                <Upload className="h-8 w-8 text-indigo-400 mb-2" />
                <span className="text-sm text-slate-200 font-bold">Drop Policy Markdown Bundle (.md)</span>
                <span className="text-xs text-slate-500 mt-1">Automatically extracts frontmatter and policy instructions</span>
                <input type="file" accept=".md" onChange={handleIngestFile} className="hidden" />
              </label>
              <div className="relative my-2 text-center">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-855" /></div>
                <span className="relative bg-slate-950 px-3 text-[10px] text-slate-500 uppercase font-bold tracking-wider">Or paste raw document</span>
              </div>
              <div className="space-y-3">
                <textarea 
                  rows={6} 
                  value={rawBundleMarkdown}
                  onChange={(e) => setRawBundleMarkdown(e.target.value)}
                  placeholder="---\ntype: sop\ntitle: Heritage Venue Governance\ndescription: Operational rules\ntags: [curfew, deposit]\n---\n\n# Policy Body..."
                  className="w-full rounded-2xl border border-slate-855 bg-[#05050a] p-4 text-xs text-slate-300 font-mono placeholder-slate-650 outline-none focus:border-indigo-500"
                />
                <button 
                  type="button" 
                  onClick={handleParseRawBundle}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/15"
                >
                  Parse &amp; Load Bundle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingConcept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setViewingConcept(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {(() => {
              const parsed = parseOkfFrontmatterAndBody(viewingConcept.yamlFrontmatter, viewingConcept.markdownBody);
              return (
                <>
                  <div className="px-6 py-4 border-b border-slate-900 flex justify-between items-center bg-slate-950/40 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <BookOpen className="h-5 w-5 text-indigo-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-white truncate">{parsed.title || viewingConcept.conceptKey}</h3>
                          {renderTypeBadge(parsed.conceptType)}
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">{viewingConcept.conceptKey}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button 
                        type="button" 
                        onClick={() => handleExportMarkdown(viewingConcept)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/50 text-slate-300 hover:text-white text-xs font-semibold transition-all"
                      >
                        <Download className="h-3.5 w-3.5" /> .md
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleExportJson(viewingConcept)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/50 text-slate-300 hover:text-white text-xs font-semibold transition-all"
                      >
                        <Download className="h-3.5 w-3.5" /> JSON
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleOpenEditModal(viewingConcept)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/15"
                      >
                        <Edit className="h-3.5 w-3.5" /> Edit Concept
                      </button>
                      <button onClick={() => setViewingConcept(null)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-lg ml-2">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950/40 border border-slate-900 p-4 rounded-2xl text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">Namespace Category</span>
                        <span className="text-slate-200 font-medium">{viewingConcept.category || "General Policy"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">Concept Type</span>
                        <span className="text-slate-200 font-medium">{parsed.conceptType}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">External Resource</span>
                        {parsed.resource ? (
                          <a 
                            href={parsed.resource} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 underline font-mono text-[11px] truncate block flex items-center gap-1"
                          >
                            <span>Open URL</span> <ExternalLink className="h-3 w-3 inline shrink-0" />
                          </a>
                        ) : (
                          <span className="text-slate-600">Internal Policy</span>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold mb-0.5">Last Updated</span>
                        <span className="text-slate-300 font-medium">
                          {viewingConcept.updatedAt ? new Date(viewingConcept.updatedAt).toLocaleDateString() : "Just now"}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Description Summary</span>
                      <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/30 border border-slate-900 p-4 rounded-2xl">
                        {parsed.description || "No description summary provided."}
                      </div>
                    </div>
                    {Array.isArray(parsed.tags) && parsed.tags.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tags</span>
                        <div className="flex flex-wrap gap-1.5">
                          {parsed.tags.map((tag, idx) => (
                            <span key={idx} className="text-xs bg-slate-900/90 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-850">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Policy Guidelines Body (Markdown)</span>
                        <button
                          type="button"
                          onClick={() => handleCopyMarkdown(parsed.markdownBody || viewingConcept.markdownBody)}
                          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors bg-slate-900/60 hover:bg-slate-900 px-3 py-1 rounded-lg border border-slate-800"
                        >
                          {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedCode ? "Copied" : "Copy Raw Markdown"}
                        </button>
                      </div>
                      <pre className="rounded-2xl border border-slate-900 bg-[#06060c] p-4 text-xs text-slate-300 font-mono overflow-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800 whitespace-pre-wrap leading-relaxed max-h-[350px]">
                        {parsed.markdownBody || viewingConcept.markdownBody}
                      </pre>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {isAuthorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setIsAuthorModalOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-900 flex justify-between items-center bg-slate-950/40 shrink-0">
              <div className="flex items-center gap-2.5">
                <Edit className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  {editingConcept ? `Edit OKF Concept: ${formKey}` : "Author OKF Concept Bundle"}
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
                  onClick={handleSaveConcept}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/15 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {editingConcept ? "Save Changes" : "Create Concept"}
                </button>
                <button onClick={() => setIsAuthorModalOpen(false)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-lg ml-2">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Concept Key</label>
                    <HelpTooltip content="A unique, snake_case key identifying this OKF concept. Immutable after creation." side="right" />
                  </div>
                  <input 
                    type="text" 
                    value={formKey}
                    onChange={(e) => setFormKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                    placeholder="e.g. wedplan_enterprise_vendor_policy" 
                    className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500 font-mono disabled:opacity-60"
                    disabled={Boolean(editingConcept)}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Namespace Category</label>
                    <HelpTooltip content="The business or operational category this concept belongs to (e.g. Wedding Operations, Safety & Compliance)." side="right" />
                  </div>
                  <input 
                    type="text" 
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="e.g. Wedding Operations" 
                    className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Concept Type</label>
                    <HelpTooltip content="The governance classification of this concept." side="right" />
                  </div>
                  <select 
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full rounded-xl border border-slate-850 bg-[#0d0d18] py-2.5 px-4 text-xs text-white outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="SOP Ruleset">SOP Ruleset</option>
                    <option value="Guideline Parameter">Guideline Parameter</option>
                    <option value="Compliance Standard">Compliance Standard</option>
                    <option value="Shared Definition/Terminology">Shared Definition/Terminology</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Concept Title</label>
                  <input 
                    type="text" 
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Heritage Venue Governance Standard" 
                    className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Resource URI (Optional)</label>
                  <input 
                    type="text" 
                    value={formResource}
                    onChange={(e) => setFormResource(e.target.value)}
                    placeholder="https://docs.company.com/sop" 
                    className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Tags (Comma-separated)</label>
                  <input 
                    type="text" 
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                    placeholder="curfew, deposit, staffing" 
                    className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Description Summary</label>
                  <HelpTooltip content="A concise summary of the policy ruleset for tool-call previews and synthesizer reports." side="right" />
                  <AiAssistButton
                    onGenerated={(text) => setFormDescription(text)}
                    mode="generate"
                    domain="okf-guideline"
                    placeholder="Generate a summary for this OKF concept..."
                  />
                </div>
                <input 
                  type="text" 
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Summarize the core operational or compliance directives..." 
                  className="w-full rounded-xl border border-slate-850 bg-slate-900/20 py-2.5 px-4 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Guidelines Body (Markdown)</label>
                  <HelpTooltip content="The comprehensive operational instructions and SOP markdown body delivered directly to workers at runtime." side="right" />
                  <AiAssistButton
                    onGenerated={(text) => setFormMarkdown(text)}
                    mode="all"
                    domain="okf-guideline"
                    placeholder="Describe the SOP sections, operational thresholds, and compliance rules..."
                  />
                </div>
                <textarea 
                  rows={12} 
                  value={formMarkdown}
                  onChange={(e) => setFormMarkdown(e.target.value)}
                  placeholder="# Mandatory Guidelines..." 
                  className="w-full rounded-2xl border border-slate-855 bg-[#05050a] p-4 text-xs text-slate-300 font-mono outline-none resize-none focus:border-indigo-500 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-855 leading-relaxed"
                />
              </div>
            </div>
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
                onClick={handleSaveConcept}
                disabled={loading}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/15 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingConcept ? "Save Changes" : "Create Concept"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingConcept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setDeletingConcept(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Delete OKF Concept</h3>
              <button onClick={() => setDeletingConcept(null)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300 mb-6 leading-relaxed">
              Are you sure you want to delete <strong className="text-white font-mono">{deletingConcept.conceptKey}</strong>? This will permanently remove these governance rules.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeletingConcept(null)}
                className="flex-1 py-2 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-semibold bg-slate-900/40 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteConcept(deletingConcept.id)}
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
