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
  Code,
  FileSpreadsheet,
  AlertTriangle,
  Users,
  Bot,
  CheckSquare,
  Square
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { HelpTooltip } from "@/components/shared/help-tooltip";
import { AiAssistButton } from "@/components/shared/ai-assist-button";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { usePermissions } from "@/lib/auth/use-permissions";

const OKF_CONCEPT_TEMPLATES: Record<string, { label: string; template: string; description: string }> = {
  "SOP Ruleset": {
    label: "SOP Ruleset (Standard Operating Procedure)",
    description: "Defines strict execution boundaries and operating rules for agents",
    template: `# Standard Operating Procedure: [Procedure Title]

## Scope & Application
Defines strict execution boundaries for agents operating within [Department/Domain].

## Non-Negotiable Directives
1. Agents MUST NOT promise discounts exceeding 15% without manager override.
2. Customer PII must be scrubbed before sending diagnostic payloads to third-party endpoints.
3. All generated contracts must include standard corporate liability disclaimers.

## Escalation Triggers
- Immediate supervisor intervention required if customer flags regulatory non-compliance.
`,
  },
  "Shared Definition/Terminology": {
    label: "Domain Glossary & Business Taxonomy",
    description: "Canonical entity definitions and forbidden synonyms",
    template: `# Domain Glossary & Business Taxonomy: [Domain]

## Core Concepts
- **Primary Entity**: Definition, attributes, and canonical lifecycle states.
- **Secondary Term**: Semantic definition and relationship to operational workflows.

## Forbidden Synonyms & Disambiguation Rules
- Do NOT use "Client Record" when referring to "Master Account".
- Always distinguish between "Gross Margin" and "Net Profit Contribution".
`,
  },
  "Compliance Standard": {
    label: "Security & Compliance Directive",
    description: "Data residency, PII controls, and regulatory mandates",
    template: `# Security & Compliance Directive: [Directive Name]

## Regulatory Framework
- Governed by: HIPAA / GDPR / SOC2 / Enterprise InfoSec Guidelines

## Mandatory Data Handling Controls
1. All outbound agent payloads must execute through the Data Masking Gateway.
2. Encryption at rest (AES-256) enforced for all cached context tokens.
3. Cross-tenant data retention is strictly prohibited.
`,
  },
  "Guideline Parameter": {
    label: "Operational Guideline Parameter",
    description: "Operational thresholds, default configurations, and runtime limits",
    template: `# Operational Guideline Parameter: [Parameter Name]

## Operational Limits & Thresholds
- Max Concurrency: 5 simultaneous worker executions
- Rate Limit: 120 calls / minute
- Human-in-the-Loop Approval Threshold: Actions impacting financial budgets >= $5,000

## Failure Recovery Policy
- Fallback tool: Local deterministic cache
- Escalation path: Alert on-call operator via notification webhook
`,
  },
};

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
 * Parses YAML frontmatter and Markdown body defensively, stripping frontmatter from markdown body.
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
  const catVal = meta.category || meta.namespace || meta.namespacecategory || meta.namespace_category || "";
  const keyVal = meta.conceptkey || meta.key || meta.concept_key || "";
  const descVal = meta.description || meta.summary || meta.descriptionsummary || meta.description_summary || "";
  const resourceVal = meta.resource || meta.resourceuri || meta.resource_uri || meta.url || meta.link || "";
  
  let tagsList: string[] = [];
  if (Array.isArray(meta.tags)) {
    tagsList = meta.tags.map(t => String(t).trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  } else if (typeof meta.tags === "string" && meta.tags.trim()) {
    tagsList = meta.tags.split(",").map(t => t.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  }

  return {
    conceptKey: Array.isArray(keyVal) ? String(keyVal[0] || "") : String(keyVal || ""),
    category: Array.isArray(catVal) ? String(catVal[0] || "") : String(catVal || ""),
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
  const { hasPermission } = usePermissions();
  const canCreateOkf = hasPermission("business_center", "okf_create");
  const canEditOkf = hasPermission("business_center", "okf_edit");
  const canDeleteOkf = hasPermission("business_center", "okf_delete");
  const canExportOkf = hasPermission("business_center", "okf_export");
  const canIngestOkf = hasPermission("business_center", "okf_ingest");

  const [concepts, setConcepts] = useState<OkfConcept[]>([]);
  const [agentUsageMap, setAgentUsageMap] = useState<Record<string, string[]>>({});
  const [rawFlows, setRawFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingConcept, setDeletingConcept] = useState<OkfConcept | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Agent Assignment Modal State
  const [assigningConcept, setAssigningConcept] = useState<OkfConcept | null>(null);
  const [selectedAgentKeys, setSelectedAgentKeys] = useState<Set<string>>(new Set());
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [assignSearchQuery, setAssignSearchQuery] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"updated" | "title" | "type" | "namespace">("updated");

  const [viewingConcept, setViewingConcept] = useState<OkfConcept | null>(null);
  const [editingConcept, setEditingConcept] = useState<OkfConcept | null>(null);
  const [isAuthorModalOpen, setIsAuthorModalOpen] = useState(false);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [activeExportMenuId, setActiveExportMenuId] = useState<string | null>(null);
  const [pendingConceptTemplateKey, setPendingConceptTemplateKey] = useState<string | null>(null);
  const [isConfirmConceptTemplateOpen, setIsConfirmConceptTemplateOpen] = useState(false);

  const handleApplyPendingConceptTemplate = () => {
    if (pendingConceptTemplateKey && OKF_CONCEPT_TEMPLATES[pendingConceptTemplateKey]) {
      const t = OKF_CONCEPT_TEMPLATES[pendingConceptTemplateKey];
      setFormMarkdown(t.template);
      setFormType(pendingConceptTemplateKey);
    }
    setPendingConceptTemplateKey(null);
    setIsConfirmConceptTemplateOpen(false);
  };

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

  const fetchAgentflows = useCallback(async () => {
    try {
      const res = await fetch("/api/agentflows");
      if (res.ok) {
        const flows = await res.json();
        const usage: Record<string, Set<string>> = {};
        const flowList = Array.isArray(flows) ? flows : (flows.agentflows || []);
        setRawFlows(flowList);
        for (const flow of flowList) {
          const nodes = flow.canvasDefinition?.nodes || [];
          for (const n of nodes) {
            const agentLabel = n.label || n.data?.label || "Agent";
            const tools = (n.tools || n.data?.tools || []).map((t: any) => typeof t === "string" ? t : (t?.name || ""));
            for (const t of tools) {
              const lower = String(t).toLowerCase().trim();
              if (!usage[lower]) usage[lower] = new Set();
              usage[lower].add(agentLabel);
              if (lower.startsWith("okf-")) {
                const keyNoPrefix = lower.slice(4);
                if (!usage[keyNoPrefix]) usage[keyNoPrefix] = new Set();
                usage[keyNoPrefix].add(agentLabel);
              }
            }
            const nodeOkf = (n.okfConcepts || n.data?.okfConcepts || n.knowledge || n.data?.knowledge || []).map((k: any) => String(k).toLowerCase().trim());
            for (const k of nodeOkf) {
              if (!usage[k]) usage[k] = new Set();
              usage[k].add(agentLabel);
            }
          }
        }
        const recordMap: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(usage)) {
          recordMap[k] = Array.from(v);
        }
        setAgentUsageMap(recordMap);
      }
    } catch (err) {
      console.error("Failed to fetch agentflows for usage mapping:", err);
    }
  }, []);

  // Open Assign OKF Concept to Agents Modal
  const handleOpenAssignModal = (concept: OkfConcept) => {
    setAssigningConcept(concept);
    setAssignSearchQuery("");
    const keyLower = concept.conceptKey.toLowerCase().trim();
    const keyWithPrefix = `okf-${keyLower}`;
    const initialSelected = new Set<string>();

    for (const flow of rawFlows) {
      let parsedNodes: any[] = [];
      if (typeof flow.canvasDefinition === "string") {
        try {
          parsedNodes = JSON.parse(flow.canvasDefinition).nodes || [];
        } catch {}
      } else if (flow.canvasDefinition?.nodes) {
        parsedNodes = flow.canvasDefinition.nodes;
      }

      for (const node of parsedNodes) {
        const tools = (node.tools || node.data?.tools || []).map((t: any) =>
          (typeof t === "string" ? t : t?.name || "").toLowerCase().trim()
        );
        const okfs = (node.okfConcepts || node.data?.okfConcepts || node.knowledge || node.data?.knowledge || []).map((k: any) =>
          String(k).toLowerCase().trim()
        );
        if (
          tools.includes(keyLower) ||
          tools.includes(keyWithPrefix) ||
          okfs.includes(keyLower) ||
          okfs.includes(keyWithPrefix)
        ) {
          initialSelected.add(`${flow.id}::${node.id}`);
        }
      }
    }

    setSelectedAgentKeys(initialSelected);
  };

  const handleToggleAgentAssignment = (flowId: string, nodeId: string) => {
    const key = `${flowId}::${nodeId}`;
    setSelectedAgentKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSaveAssignments = async () => {
    if (!assigningConcept) return;
    setSavingAssignments(true);
    try {
      const keyLower = assigningConcept.conceptKey.toLowerCase().trim();
      const toolName = `okf-${keyLower}`;
      let updatedFlowCount = 0;

      for (const flow of rawFlows) {
        let canvasObj: any = {};
        if (typeof flow.canvasDefinition === "string") {
          try {
            canvasObj = JSON.parse(flow.canvasDefinition);
          } catch {
            canvasObj = { nodes: [], edges: [] };
          }
        } else if (flow.canvasDefinition) {
          canvasObj = JSON.parse(JSON.stringify(flow.canvasDefinition));
        }

        const nodes = canvasObj.nodes || [];
        let flowModified = false;

        for (const node of nodes) {
          const key = `${flow.id}::${node.id}`;
          const shouldHaveConcept = selectedAgentKeys.has(key);

          const currentTools: any[] = node.tools || node.data?.tools || [];
          const hasInTools = currentTools.some((t: any) => {
            const tName = (typeof t === "string" ? t : t?.name || "").toLowerCase().trim();
            return tName === keyLower || tName === toolName;
          });

          if (shouldHaveConcept && !hasInTools) {
            const newToolRef = {
              id: `okf-ref-${crypto.randomUUID()}`,
              name: toolName,
              category: "okf_concept",
              description: assigningConcept.parsed?.title || assigningConcept.conceptKey,
            };
            node.tools = [...currentTools, newToolRef];
            if (node.data) node.data.tools = node.tools;
            flowModified = true;
          } else if (!shouldHaveConcept && hasInTools) {
            node.tools = currentTools.filter((t: any) => {
              const tName = (typeof t === "string" ? t : t?.name || "").toLowerCase().trim();
              return tName !== keyLower && tName !== toolName;
            });
            if (node.data) node.data.tools = node.tools;
            flowModified = true;
          }
        }

        if (flowModified) {
          const res = await fetch(`/api/agentflows/${flow.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ canvasDefinition: canvasObj }),
          });
          if (res.ok) {
            updatedFlowCount++;
          }
        }
      }

      setAlertMessage(`OKF Concept assigned successfully across ${updatedFlowCount} agentflow(s).`);
      setAssigningConcept(null);
      await fetchAgentflows();
    } catch (err) {
      console.error("Failed to save OKF concept assignments:", err);
      setAlertMessage("Failed to update agent OKF concept assignments. Please try again.");
    } finally {
      setSavingAssignments(false);
    }
  };

  useEffect(() => {
    fetchConcepts();
    fetchAgentflows();
  }, [fetchConcepts, fetchAgentflows]);

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
    setFormMarkdown(OKF_CONCEPT_TEMPLATES["SOP Ruleset"]?.template || "");
    setEditingConcept(null);
    setIsAuthorModalOpen(true);
  };

  const handleUploadGoogleOkfTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;

        if (file.name.endsWith(".json")) {
          const json = JSON.parse(text);
          if (json.conceptKey || json.key) setFormKey(String(json.conceptKey || json.key).toLowerCase().replace(/[^a-z0-9_]/g, "_"));
          if (json.category || json.namespace) setFormCategory(String(json.category || json.namespace));
          if (json.conceptType || json.type) setFormType(normalizeConceptType(json.conceptType || json.type));
          if (json.title) setFormTitle(String(json.title));
          if (json.description || json.summary) setFormDescription(String(json.description || json.summary));
          if (json.resource || json.uri) setFormResource(String(json.resource || json.uri));
          if (json.tags) setFormTags(Array.isArray(json.tags) ? json.tags.join(", ") : String(json.tags));
          if (json.markdownBody || json.body || json.guidelines) {
            setFormMarkdown(String(json.markdownBody || json.body || json.guidelines));
          }
        } else {
          // Markdown with optional YAML frontmatter
          const frontmatterMatch = text.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n?([\s\S]*)$/);
          if (frontmatterMatch) {
            const yaml = frontmatterMatch[1];
            const body = frontmatterMatch[2];
            setFormMarkdown(body.trim());

            const keyMatch = yaml.match(/conceptKey:\s*([^\r\n]+)/);
            const catMatch = yaml.match(/category:\s*([^\r\n]+)/);
            const typeMatch = yaml.match(/conceptType:\s*([^\r\n]+)/);
            const titleMatch = yaml.match(/title:\s*([^\r\n]+)/);
            const descMatch = yaml.match(/description:\s*([^\r\n]+)/);
            const uriMatch = yaml.match(/resource:\s*([^\r\n]+)/);
            const tagsMatch = yaml.match(/tags:\s*\[?([^\r\n\]]+)\]?/);

            if (keyMatch) setFormKey(keyMatch[1].trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));
            if (catMatch) setFormCategory(catMatch[1].trim());
            if (typeMatch) setFormType(normalizeConceptType(typeMatch[1].trim()));
            if (titleMatch) setFormTitle(titleMatch[1].trim());
            if (descMatch) setFormDescription(descMatch[1].trim());
            if (uriMatch) setFormResource(uriMatch[1].trim());
            if (tagsMatch) setFormTags(tagsMatch[1].trim());
          } else {
            setFormMarkdown(text.trim());
            setFormTitle(file.name.replace(/\.(md|txt)$/i, ""));
            setFormKey(file.name.replace(/\.(md|txt)$/i, "").toLowerCase().replace(/[^a-z0-9_]/g, "_"));
          }
        }
      } catch (err) {
        console.error("Failed to parse uploaded OKF template:", err);
        alert("Error parsing file. Please ensure it is valid Markdown with frontmatter or valid JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
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

      // Ensure formMarkdown has any accidental frontmatter header stripped
      const cleanMarkdown = formMarkdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n?/, "").trim();

      if (!editingConcept) {
        const res = await fetch("/api/okf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: formCategory || "General Policy",
            conceptKey: formKey.trim(),
            yamlFrontmatter: generatedFrontmatter,
            markdownBody: cleanMarkdown,
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
            markdownBody: cleanMarkdown,
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

  const handleExportCsv = () => {
    const headers = ["Concept Key", "Title", "Type", "Namespace Category", "Tags", "Description Summary", "Active Agents", "Created At"];
    const rows = filteredConcepts.map(item => {
      const boundAgents = (agentUsageMap[item.conceptKey.toLowerCase()] || agentUsageMap[`okf-${item.conceptKey.toLowerCase()}`] || []).join("; ");
      const tags = Array.isArray(item.parsed.tags) ? item.parsed.tags.join(", ") : "";
      return [
        `"${(item.conceptKey || "").replace(/"/g, '""')}"`,
        `"${(item.parsed.title || item.conceptKey || "").replace(/"/g, '""')}"`,
        `"${(item.parsed.conceptType || "").replace(/"/g, '""')}"`,
        `"${(item.category || "General Policy").replace(/"/g, '""')}"`,
        `"${tags.replace(/"/g, '""')}"`,
        `"${(item.parsed.description || "").replace(/"/g, '""')}"`,
        `"${boundAgents.replace(/"/g, '""')}"`,
        `"${item.updatedAt || ""}"`
      ].join(",");
    });
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "okf-concepts-export.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      if (!text) return;

      if (file.name.toLowerCase().endsWith(".json")) {
        try {
          const data = JSON.parse(text);
          const rawKey = data.conceptKey || data.key || data.concept_key || file.name.replace(/\.json$/i, "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
          const rawTitle = data.title || data.conceptTitle || data.concept_title || "";
          const rawCat = data.category || data.namespaceCategory || data.namespace || data.category_name || "General Policy";
          const rawType = normalizeConceptType(data.conceptType || data.type || data.concept_type || "SOP Ruleset");
          const rawDesc = data.description || data.descriptionSummary || data.summary || data.description_summary || "";
          const rawResource = data.resource || data.resourceUri || data.resource_uri || data.url || data.link || "";
          let rawTags = "";
          if (Array.isArray(data.tags)) rawTags = data.tags.join(", ");
          else if (typeof data.tags === "string") rawTags = data.tags;

          let rawMd = data.markdownBody || data.guidelinesBody || data.guidelines_body || data.content || "";
          const parsed = parseOkfFrontmatterAndBody(undefined, rawMd);

          setFormKey(rawKey);
          setFormCategory(rawCat);
          setFormType(rawType);
          setFormTitle(rawTitle || parsed.title || rawKey);
          setFormResource(rawResource || parsed.resource || "");
          setFormTags(rawTags || (Array.isArray(parsed.tags) ? parsed.tags.join(", ") : ""));
          setFormDescription(rawDesc || parsed.description || "");
          setFormMarkdown(parsed.markdownBody || rawMd);
          setIsIngestModalOpen(false);
          setEditingConcept(null);
          setIsAuthorModalOpen(true);
          return;
        } catch {
          // Fall through to markdown parsing
        }
      }

      const parsed = parseOkfFrontmatterAndBody(undefined, text);
      const derivedKey = file.name.replace(/\.(md|txt|json)$/i, "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
      setFormKey(parsed.conceptKey || derivedKey);
      setFormCategory(parsed.category || "General Policy");
      setFormType(parsed.conceptType);
      setFormTitle(parsed.title || derivedKey);
      setFormDescription(parsed.description || `Imported guidelines from ${file.name}`);
      setFormResource(parsed.resource || "");
      setFormTags(Array.isArray(parsed.tags) ? parsed.tags.join(", ") : "");
      setFormMarkdown(parsed.markdownBody || text.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n?/, "").trim());
      setIsIngestModalOpen(false);
      setEditingConcept(null);
      setIsAuthorModalOpen(true);
    };
    reader.readAsText(file);
  };

  const handleParseRawBundle = () => {
    if (!rawBundleMarkdown.trim()) return;

    if (rawBundleMarkdown.trim().startsWith("{")) {
      try {
        const data = JSON.parse(rawBundleMarkdown);
        const rawKey = data.conceptKey || data.key || data.concept_key || "imported_concept";
        const rawTitle = data.title || data.conceptTitle || data.concept_title || "";
        const rawCat = data.category || data.namespaceCategory || data.namespace || data.category_name || "General Policy";
        const rawType = normalizeConceptType(data.conceptType || data.type || data.concept_type || "SOP Ruleset");
        const rawDesc = data.description || data.descriptionSummary || data.summary || data.description_summary || "";
        const rawResource = data.resource || data.resourceUri || data.resource_uri || data.url || data.link || "";
        let rawTags = "";
        if (Array.isArray(data.tags)) rawTags = data.tags.join(", ");
        else if (typeof data.tags === "string") rawTags = data.tags;

        let rawMd = data.markdownBody || data.guidelinesBody || data.guidelines_body || data.content || "";
        const parsed = parseOkfFrontmatterAndBody(undefined, rawMd);

        setFormKey(rawKey);
        setFormCategory(rawCat);
        setFormType(rawType);
        setFormTitle(rawTitle || parsed.title || rawKey);
        setFormResource(rawResource || parsed.resource || "");
        setFormTags(rawTags || (Array.isArray(parsed.tags) ? parsed.tags.join(", ") : ""));
        setFormDescription(rawDesc || parsed.description || "");
        setFormMarkdown(parsed.markdownBody || rawMd);
        setRawBundleMarkdown("");
        setIsIngestModalOpen(false);
        setEditingConcept(null);
        setIsAuthorModalOpen(true);
        return;
      } catch {
        // Fall through to markdown bundle parsing
      }
    }

    const parsed = parseOkfFrontmatterAndBody(undefined, rawBundleMarkdown);
    setFormKey(parsed.conceptKey || "imported_okf_concept");
    setFormCategory(parsed.category || "General Policy");
    setFormType(parsed.conceptType);
    setFormTitle(parsed.title || "Imported OKF Concept");
    setFormDescription(parsed.description || "Imported policy guidelines");
    setFormResource(parsed.resource || "");
    setFormTags(Array.isArray(parsed.tags) ? parsed.tags.join(", ") : "");
    setFormMarkdown(parsed.markdownBody || rawBundleMarkdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n?/, "").trim());
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
    <div className="flex-1 flex flex-col min-h-0 bg-card rounded-2xl border border-border overflow-hidden">
      <div className="p-4 border-b border-border bg-card flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-primary" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider font-mono">OKF Concepts</h2>
              <HelpTooltip content="Open Knowledge Framework (OKF) concepts provide structured SOPs, parameters, and compliance rules that workers ingest at runtime." side="right" />
            </div>
            <span className="text-[11px] text-muted-foreground">
              Total: <strong className="text-foreground">{filteredConcepts.length}</strong> concepts persisted
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {canExportOkf && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border hover:border-border bg-muted/50 hover:bg-muted text-foreground hover:text-foreground text-xs font-semibold transition-all shadow-sm cursor-pointer"
              title="Export all concepts to CSV"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" /> Export CSV
            </button>
          )}
          {canIngestOkf && (
            <button
              type="button"
              onClick={() => setIsIngestModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border hover:border-border bg-muted/50 hover:bg-muted text-foreground hover:text-foreground text-xs font-semibold transition-all shadow-sm cursor-pointer"
            >
              <Upload className="h-4 w-4 text-muted-foreground" /> Ingest Bundle
            </button>
          )}
          {canCreateOkf && (
            <button
              type="button"
              onClick={handleOpenAuthorModal}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> + New Concept
            </button>
          )}
        </div>
      </div>

      <div className="p-3.5 border-b border-border bg-card flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by key, title, tags, summary, namespace..."
            className="w-full rounded-xl border border-border bg-muted/50 py-1.5 pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center gap-1.5 bg-muted/30 p-1 rounded-xl border border-border">
            {typeFilterOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedTypeFilter(opt.value)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                  selectedTypeFilter === opt.value
                    ? "bg-primary/20 border-indigo-500/50 text-primary shadow-sm"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-muted border border-border text-xs text-foreground rounded-xl px-2.5 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="updated">Recently Updated</option>
              <option value="title">Title (A-Z)</option>
              <option value="type">Concept Type</option>
              <option value="namespace">Namespace Category</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted">
        {loading && concepts.length === 0 ? (
          <div className="flex flex-col justify-center items-center py-24 text-muted-foreground text-xs gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span>Loading OKF concept library...</span>
          </div>
        ) : filteredConcepts.length === 0 ? (
          <div className="text-center py-24 px-4 space-y-3">
            <FolderOpen className="h-10 w-10 text-slate-700 mx-auto" />
            <p className="text-foreground text-sm font-semibold">
              {searchQuery || selectedTypeFilter !== "All" ? "No OKF concepts match your search filters." : "No concepts registered yet."}
            </p>
            <p className="text-muted-foreground text-xs max-w-sm mx-auto">
              {searchQuery || selectedTypeFilter !== "All" 
                ? "Try adjusting your search keywords or resetting the type filter." 
                : "Author a new concept bundle or drop an existing policy .md or .json file."}
            </p>
            <button
              type="button"
              onClick={handleOpenAuthorModal}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold transition-all shadow-md shadow-primary/20 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Author New Concept
            </button>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-[10px] uppercase font-bold text-muted-foreground font-mono tracking-wider">
                <th className="py-3 px-4">Concept Title &amp; Key</th>
                <th className="py-3 px-4">Concept Type</th>
                <th className="py-3 px-4">Namespace Category</th>
                <th className="py-3 px-4">Tags</th>
                <th className="py-3 px-4">Description Summary</th>
                <th className="py-3 px-4">Active In Agents</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {filteredConcepts.map((item) => {
                const boundAgents = agentUsageMap[item.conceptKey.toLowerCase()] || agentUsageMap[`okf-${item.conceptKey.toLowerCase()}`] || [];
                return (
                  <tr 
                    key={item.id}
                    className="group hover:bg-muted/30 transition-colors text-xs"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {item.parsed.title || item.conceptKey}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {item.conceptKey}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {renderTypeBadge(item.parsed.conceptType)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded bg-muted border border-border text-[10px] text-foreground font-medium">
                        {item.category || "General Policy"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 max-w-[160px]">
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(item.parsed.tags) && item.parsed.tags.length > 0 ? (
                          <>
                            {item.parsed.tags.slice(0, 2).map((tag, idx) => (
                              <span key={idx} className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded border border-border">
                                #{tag}
                              </span>
                            ))}
                            {item.parsed.tags.length > 2 && (
                              <span className="text-[9px] text-muted-foreground font-mono self-center">
                                +{item.parsed.tags.length - 2}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">â€”</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="text-muted-foreground truncate text-[11px] leading-relaxed" title={item.parsed.description}>
                        {item.parsed.description || "No description summary provided."}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 max-w-[200px]">
                      {boundAgents.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleOpenAssignModal(item)}
                          className="flex flex-wrap items-center gap-1 text-left group/badge cursor-pointer"
                          title="Click to manage agent assignments"
                        >
                          {boundAgents.slice(0, 2).map((agent, idx) => (
                            <span key={idx} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20 font-medium group-hover/badge:border-primary">
                              {agent}
                            </span>
                          ))}
                          {boundAgents.length > 2 && (
                            <span className="text-[9px] text-muted-foreground font-mono" title={boundAgents.slice(2).join(", ")}>
                              +{boundAgents.length - 2}
                            </span>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenAssignModal(item)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-[10px] text-muted-foreground border border-border hover:border-primary hover:text-foreground cursor-pointer transition-all"
                          title="Assign this OKF concept to agents"
                        >
                          <Plus className="h-2.5 w-2.5" /> Assign Agents
                        </button>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingConcept(item)}
                          className="p-1.5 rounded-lg border border-border hover:border-border bg-muted/40 hover:bg-muted text-foreground hover:text-foreground transition-all cursor-pointer"
                          title="View Document"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {canEditOkf && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 rounded-lg border border-border hover:border-indigo-500/40 bg-muted/40 hover:bg-indigo-950/20 text-foreground hover:text-primary transition-all cursor-pointer"
                            title="Edit Concept"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canExportOkf && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setActiveExportMenuId(activeExportMenuId === item.id ? null : item.id)}
                              className="p-1.5 rounded-lg border border-border hover:border-border bg-muted/40 hover:bg-muted text-foreground hover:text-foreground transition-all cursor-pointer"
                              title="Export Options"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            {activeExportMenuId === item.id && (
                              <div className="absolute right-0 top-full mt-1 w-32 bg-card border border-border rounded-xl shadow-2xl py-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                                <button
                                  type="button"
                                  onClick={() => handleExportMarkdown(item)}
                                  className="w-full px-3 py-1.5 text-left text-xs text-foreground hover:text-foreground hover:bg-muted flex items-center gap-2 cursor-pointer"
                                >
                                  <FileText className="h-3.5 w-3.5 text-primary" /> Export .md
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleExportJson(item)}
                                  className="w-full px-3 py-1.5 text-left text-xs text-foreground hover:text-foreground hover:bg-muted flex items-center gap-2 cursor-pointer"
                                >
                                  <Code className="h-3.5 w-3.5 text-amber-400" /> Export JSON
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {canDeleteOkf && (
                          <button
                            type="button"
                            onClick={() => setDeletingConcept(item)}
                            className="p-1.5 rounded-lg border border-border hover:border-red-500/40 bg-muted/40 hover:bg-red-950/20 text-muted-foreground hover:text-red-400 transition-all cursor-pointer"
                            title="Delete Concept"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {isIngestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setIsIngestModalOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-card">
              <div className="flex items-center gap-2.5">
                <Upload className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Ingest OKF Concept Bundle</h3>
              </div>
              <button onClick={() => setIsIngestModalOpen(false)} className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-primary/20 hover:border-indigo-500/60 bg-indigo-950/10 hover:bg-indigo-950/20 rounded-2xl p-8 cursor-pointer transition-all">
                <Upload className="h-8 w-8 text-primary mb-2" />
                <span className="text-sm text-foreground font-bold">Drop Policy Markdown / JSON Bundle (.md, .json)</span>
                <span className="text-xs text-muted-foreground mt-1">Automatically extracts metadata, tags, and policy instructions</span>
                <input type="file" accept=".md,.json,.txt" onChange={handleIngestFile} className="hidden" />
              </label>
              <div className="relative my-2 text-center">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                <span className="relative bg-card px-3 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Or paste raw document or JSON</span>
              </div>
              <div className="space-y-3">
                <textarea 
                  rows={6} 
                  value={rawBundleMarkdown}
                  onChange={(e) => setRawBundleMarkdown(e.target.value)}
                  placeholder="---\ntype: sop\ntitle: Heritage Venue Governance\ndescription: Operational rules\ntags: [curfew, deposit]\n---\n\n# Policy Body..."
                  className="w-full rounded-2xl border border-border bg-muted/30 p-4 text-xs text-foreground font-mono placeholder-slate-650 outline-none focus:border-indigo-500"
                />
                <button 
                  type="button" 
                  onClick={handleParseRawBundle}
                  className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 cursor-pointer"
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
          <div className="relative bg-card border border-border rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {(() => {
              const parsed = parseOkfFrontmatterAndBody(viewingConcept.yamlFrontmatter, viewingConcept.markdownBody);
              const boundAgents = agentUsageMap[viewingConcept.conceptKey.toLowerCase()] || agentUsageMap[`okf-${viewingConcept.conceptKey.toLowerCase()}`] || [];
              return (
                <>
                  <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-card shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <BookOpen className="h-5 w-5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-foreground truncate">{parsed.title || viewingConcept.conceptKey}</h3>
                          {renderTypeBadge(parsed.conceptType)}
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground">{viewingConcept.conceptKey}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button 
                        type="button" 
                        onClick={() => handleExportMarkdown(viewingConcept)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border hover:border-border bg-muted/50 text-foreground hover:text-foreground text-xs font-semibold transition-all cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" /> .md
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleExportJson(viewingConcept)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border hover:border-border bg-muted/50 text-foreground hover:text-foreground text-xs font-semibold transition-all cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" /> JSON
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleOpenEditModal(viewingConcept)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 cursor-pointer"
                      >
                        <Edit className="h-3.5 w-3.5" /> Edit Concept
                      </button>
                      <button onClick={() => setViewingConcept(null)} className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg ml-2 cursor-pointer">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-card border border-border p-4 rounded-2xl text-xs">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold mb-0.5">Namespace Category</span>
                        <span className="text-foreground font-medium">{viewingConcept.category || "General Policy"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold mb-0.5">Concept Type</span>
                        <span className="text-foreground font-medium">{parsed.conceptType}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold mb-0.5">External Resource</span>
                        {parsed.resource ? (
                          <a 
                            href={parsed.resource} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary underline font-mono text-[11px] truncate block flex items-center gap-1"
                          >
                            <span>Open URL</span> <ExternalLink className="h-3 w-3 inline shrink-0" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">Internal Policy</span>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold mb-0.5">Bound In Agents</span>
                        <span className="text-primary font-medium font-mono text-[11px]">
                          {boundAgents.length > 0 ? boundAgents.join(", ") : "None"}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Description Summary</span>
                      <div className="text-xs text-foreground leading-relaxed bg-card border border-border p-4 rounded-2xl">
                        {parsed.description || "No description summary provided."}
                      </div>
                    </div>
                    {Array.isArray(parsed.tags) && parsed.tags.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Tags</span>
                        <div className="flex flex-wrap gap-1.5">
                          {parsed.tags.map((tag, idx) => (
                            <span key={idx} className="text-xs bg-muted/90 text-foreground px-2.5 py-1 rounded-lg border border-border">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Policy Guidelines Body (Markdown)</span>
                        <button
                          type="button"
                          onClick={() => handleCopyMarkdown(parsed.markdownBody || viewingConcept.markdownBody)}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors bg-muted/60 hover:bg-muted px-3 py-1 rounded-lg border border-border cursor-pointer"
                        >
                          {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedCode ? "Copied" : "Copy Raw Markdown"}
                        </button>
                      </div>
                      <pre className="rounded-2xl border border-border bg-muted/30 p-4 text-xs text-foreground font-mono overflow-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted whitespace-pre-wrap leading-relaxed max-h-[350px]">
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
          <div className="relative bg-card border border-border rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-card shrink-0">
              <div className="flex items-center gap-2.5">
                <Edit className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  {editingConcept ? `Edit OKF Concept: ${formKey}` : "Author OKF Concept Bundle"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsAuthorModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-xs font-semibold transition-all bg-card cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleSaveConcept}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary hover:bg-primary text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {editingConcept ? "Save Changes" : "Create Concept"}
                </button>
                <button onClick={() => setIsAuthorModalOpen(false)} className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg ml-2 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Concept Key</label>
                    <HelpTooltip content="A unique, snake_case key identifying this OKF concept. Immutable after creation." side="right" />
                  </div>
                  <input 
                    type="text" 
                    value={formKey}
                    onChange={(e) => setFormKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                    placeholder="e.g. wedplan_enterprise_vendor_policy" 
                    className="w-full rounded-xl border border-border bg-muted/20 py-2.5 px-4 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500 font-mono disabled:opacity-60"
                    disabled={Boolean(editingConcept)}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Namespace Category</label>
                    <HelpTooltip content="The business or operational category this concept belongs to (e.g. Wedding Operations, Safety & Compliance)." side="right" />
                  </div>
                  <input 
                    type="text" 
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="e.g. Wedding Operations" 
                    className="w-full rounded-xl border border-border bg-muted/20 py-2.5 px-4 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Concept Type</label>
                    <HelpTooltip content="The governance classification of this concept." side="right" />
                  </div>
                  <select 
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background py-2.5 px-4 text-xs text-foreground outline-none focus:border-indigo-500 cursor-pointer"
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
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Concept Title</label>
                  <input 
                    type="text" 
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Heritage Venue Governance Standard" 
                    className="w-full rounded-xl border border-border bg-muted/20 py-2.5 px-4 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Resource URI (Optional)</label>
                  <input 
                    type="text" 
                    value={formResource}
                    onChange={(e) => setFormResource(e.target.value)}
                    placeholder="https://docs.company.com/sop" 
                    className="w-full rounded-xl border border-border bg-muted/20 py-2.5 px-4 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tags (Comma-separated)</label>
                  <input 
                    type="text" 
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                    placeholder="curfew, deposit, staffing" 
                    className="w-full rounded-xl border border-border bg-muted/20 py-2.5 px-4 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Description Summary</label>
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
                  className="w-full rounded-xl border border-border bg-muted/20 py-2.5 px-4 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500"
                />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Guidelines Body (Markdown)</label>
                    <HelpTooltip content="The comprehensive operational instructions and SOP markdown body delivered directly to workers at runtime." side="right" />
                    <AiAssistButton
                      onGenerated={(text) => setFormMarkdown(text)}
                      mode="all"
                      domain="okf-guideline"
                      placeholder="Describe the SOP sections, operational thresholds, and compliance rules..."
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground cursor-pointer shadow-xs transition-colors">
                      <Upload className="h-3.5 w-3.5 text-primary" />
                      <span>Upload OKF Template</span>
                      <input
                        type="file"
                        accept=".md,.json,.txt"
                        onChange={handleUploadGoogleOkfTemplate}
                        className="hidden"
                      />
                    </label>

                    <select
                      defaultValue=""
                      value=""
                      onChange={(e) => {
                        const key = e.target.value;
                        if (!key || !OKF_CONCEPT_TEMPLATES[key]) return;
                        if (formMarkdown.trim()) {
                          setPendingConceptTemplateKey(key);
                          setIsConfirmConceptTemplateOpen(true);
                        } else {
                          const t = OKF_CONCEPT_TEMPLATES[key];
                          setFormMarkdown(t.template);
                          setFormType(key);
                        }
                        e.target.value = "";
                      }}
                      className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-foreground outline-none focus:border-primary cursor-pointer shadow-xs"
                    >
                      <option value="" disabled>Load Concept Template...</option>
                      {Object.entries(OKF_CONCEPT_TEMPLATES).map(([k, t]) => (
                        <option key={k} value={k}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <MarkdownEditor 
                  value={formMarkdown}
                  onChange={setFormMarkdown}
                  placeholder="# Mandatory Guidelines..."
                  minHeight="320px"
                  maxHeight="520px"
                />
              </div>
            </div>
            <div className="px-6 py-3.5 border-t border-border bg-muted/50 flex justify-end items-center gap-2.5 shrink-0">
              <button 
                type="button" 
                onClick={() => setIsAuthorModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-border text-muted-foreground hover:text-foreground text-xs font-semibold transition-all bg-card cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleSaveConcept}
                disabled={loading}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-primary text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 disabled:opacity-50 cursor-pointer"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingConcept ? "Save Changes" : "Create Concept"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styled AlertDialog for OKF Template Confirmation */}
      <AlertDialog open={isConfirmConceptTemplateOpen} onOpenChange={setIsConfirmConceptTemplateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-500/10 p-2 text-amber-500 border border-amber-500/20 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <AlertDialogTitle>Replace Content with Template?</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Loading this blueprint will replace your current editor content. This action cannot be undone unless manually reverted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingConceptTemplateKey(null);
                setIsConfirmConceptTemplateOpen(false);
              }}
            >
              Keep Current Content
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleApplyPendingConceptTemplate}>
              Apply Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {deletingConcept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setDeletingConcept(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-3xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground">Delete OKF Concept</h3>
              <button onClick={() => setDeletingConcept(null)} className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-foreground mb-6 leading-relaxed">
              Are you sure you want to delete <strong className="text-foreground font-mono">{deletingConcept.conceptKey}</strong>? This will permanently remove these governance rules.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeletingConcept(null)}
                className="flex-1 py-2 rounded-xl border border-border hover:border-border text-muted-foreground hover:text-foreground text-xs font-semibold bg-muted/40 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteConcept(deletingConcept.id)}
                className="flex-1 py-2 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-bold transition-all cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign OKF Concept to Agents Modal ── */}
      {assigningConcept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setAssigningConcept(null)} className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-3xl shadow-2xl p-6 w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    Assign OKF Concept to Agents
                    <span className="font-mono text-primary font-normal">
                      ({assigningConcept.parsed?.title || assigningConcept.conceptKey})
                    </span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Bind or unbind this OKF governance concept across agents in published and draft flows.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssigningConcept(null)}
                className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Filter Search */}
            <div className="py-3 border-b border-border/60 shrink-0">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={assignSearchQuery}
                  onChange={(e) => setAssignSearchQuery(e.target.value)}
                  placeholder="Filter flows or agent names..."
                  className="w-full rounded-xl border border-border bg-muted/50 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Flows & Agents List */}
            <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted">
              {rawFlows.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-xs">
                  No agentflows found. Create an agentflow in Capability Studio to assign OKF concepts.
                </div>
              ) : (
                rawFlows.map((flow) => {
                  let nodes: any[] = [];
                  if (typeof flow.canvasDefinition === "string") {
                    try {
                      nodes = JSON.parse(flow.canvasDefinition).nodes || [];
                    } catch {}
                  } else if (flow.canvasDefinition?.nodes) {
                    nodes = flow.canvasDefinition.nodes;
                  }

                  const workerNodes = nodes.filter((n: any) => n.roleTemplate !== "team");
                  if (workerNodes.length === 0) return null;

                  const filteredNodes = workerNodes.filter((n: any) => {
                    if (!assignSearchQuery.trim()) return true;
                    const q = assignSearchQuery.toLowerCase();
                    const flowMatch = (flow.name || "").toLowerCase().includes(q);
                    const nodeMatch = (n.label || "").toLowerCase().includes(q);
                    return flowMatch || nodeMatch;
                  });

                  if (filteredNodes.length === 0) return null;

                  return (
                    <div key={flow.id} className="rounded-2xl border border-border bg-muted/30 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
                        <span className="text-xs font-bold text-foreground font-mono flex items-center gap-2">
                          <Bot className="h-3.5 w-3.5 text-primary" />
                          {flow.name || "Untitled Agentflow"}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          flow.status === "published"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}>
                          {flow.status || "draft"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {filteredNodes.map((n: any) => {
                          const key = `${flow.id}::${n.id}`;
                          const isAssigned = selectedAgentKeys.has(key);

                          return (
                            <div
                              key={n.id}
                              onClick={() => handleToggleAgentAssignment(flow.id, n.id)}
                              className={`flex items-center gap-2.5 p-2 rounded-xl border cursor-pointer transition-all ${
                                isAssigned
                                  ? "bg-primary/10 border-primary/50 text-foreground"
                                  : "bg-card border-border text-muted-foreground hover:border-border hover:text-foreground"
                              }`}
                            >
                              <div className={`p-1 rounded-md shrink-0 ${isAssigned ? "text-primary" : "text-muted-foreground"}`}>
                                {isAssigned ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-xs font-semibold block truncate">
                                  {n.label || "Specialist Worker"}
                                </span>
                                <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-mono">
                                  {n.roleTemplate || "worker"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-border shrink-0">
              <span className="text-xs text-muted-foreground">
                Selected: <strong className="text-primary font-mono">{selectedAgentKeys.size}</strong> agent(s)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAssigningConcept(null)}
                  className="px-4 py-2 rounded-xl border border-border hover:border-border text-muted-foreground hover:text-foreground text-xs font-semibold bg-muted/40 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAssignments}
                  disabled={savingAssignments}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 disabled:opacity-50 cursor-pointer"
                >
                  {savingAssignments ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save Assignments
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


