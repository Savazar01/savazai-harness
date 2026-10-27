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
  Sparkles,
  FileSpreadsheet,
  Bot,
  Users,
  CheckSquare,
  Square
} from "lucide-react";
import { HelpTooltip } from "@/components/shared/help-tooltip";
import { AiAssistButton } from "@/components/shared/ai-assist-button";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { usePermissions } from "@/lib/auth/use-permissions";

const SKILL_TEMPLATES: Record<string, { label: string; template: string; category?: Skill["category"] }> = {
  business_process: {
    label: "Standard Business Process Agent Skill (Default)",
    category: "custom",
    template: `# Business Process Skill: [Process Name]

## 1. Operational Objective
Explain what business outcome this skill delivers (e.g., Customer Credit Approval, Purchase Order Invoicing).

## 2. Execution Prerequisites & Inputs
- Required parameters: \`customerId\`, \`orderTotal\`, \`approvalLevel\`
- Upstream system dependencies: ERP / CRM / Database connectors

## 3. Deterministic Decision Rules
1. If order total < $10,000 -> Auto-approve with standard audit log.
2. If order total >= $10,000 -> Escalate to Financial Controller with generated approval memo.
3. If credit score is missing -> Halt and request human operator review.

## 4. Expected Output Schema & Artifacts
- Status: \`APPROVED\` | \`REJECTED\` | \`ESCALATED\`
- Summary JSON payload returned to supervisor agent.
`,
  },
  custom_js: {
    label: "Custom Local JS Snippet",
    category: "custom",
    template: `/**
 * @name custom_data_processor
 * @description Local sandboxed execution snippet for data transformation.
 * @param {Record<string, unknown>} args - Input parameters from caller agent.
 * @returns {Promise<{ success: boolean; data: unknown }>}
 */
async function execute(args) {
  try {
    const { items, threshold = 100 } = args;
    if (!Array.isArray(items)) {
      throw new Error("Missing or invalid 'items' array parameter");
    }

    const filtered = items.filter(item => (item.value || 0) >= threshold);

    return {
      success: true,
      data: {
        processedCount: filtered.length,
        results: filtered,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || "Execution failed"
    };
  }
}
`,
  },
  native_ts: {
    label: "Native TypeScript Tool",
    category: "native",
    template: `import { z } from "zod";

/**
 * Tool Definition Contract
 */
export const InputSchema = z.object({
  entityId: z.string().uuid().describe("Unique identifier of target entity"),
  action: z.enum(["fetch", "sync", "archive"]).describe("Action to perform"),
  payload: z.record(z.unknown()).optional().describe("Dynamic payload object")
});

export type ToolInput = z.infer<typeof InputSchema>;

export interface ToolOutput {
  status: "SUCCESS" | "FAILED";
  recordsAffected: number;
  message: string;
}

export async function run(input: ToolInput): Promise<ToolOutput> {
  // Native execution logic
  return {
    status: "SUCCESS",
    recordsAffected: 1,
    message: \`Action \${input.action} executed for entity \${input.entityId}\`
  };
}
`,
  },
  mcp_connector: {
    label: "MCP-Bound Connector Skill",
    category: "mcp",
    template: `# MCP Tool Binding Specification

## Server Connection
- Server ID: \`mcp_server_identifier\`
- Remote Method: \`tools/call\`
- Transport: \`streamable-http\` | \`sse\` | \`stdio\`

## Tool Signature
- Method: \`execute_operation\`
- Target Service: Internal Enterprise RPC

## JSON-RPC 2.0 Mapping
\`\`\`json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "target_tool_name",
    "arguments": {
      "workspaceId": "{workspaceId}",
      "filter": "active"
    }
  }
}
\`\`\`

## Resilience & Retry Strategy
- Max Retries: 3
- Timeout: 15000ms
- Fallback: Emit degraded receipt to Synthesizer node
`,
  },
};

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
  const { hasPermission } = usePermissions();
  const canCreateSkill = hasPermission("business_center", "skills_create");
  const canEditSkill = hasPermission("business_center", "skills_edit");
  const canDeleteSkill = hasPermission("business_center", "skills_delete");
  const canExportSkill = hasPermission("business_center", "skills_export");
  const canImportSkill = hasPermission("business_center", "skills_import");

  const [skills, setSkills] = useState<Skill[]>([]);
  const [agentUsageMap, setAgentUsageMap] = useState<Record<string, string[]>>({});
  const [rawFlows, setRawFlows] = useState<any[]>([]);
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

  // Agent Assignment Modal State
  const [assigningSkill, setAssigningSkill] = useState<Skill | null>(null);
  const [selectedAgentKeys, setSelectedAgentKeys] = useState<Set<string>>(new Set());
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [assignSearchQuery, setAssignSearchQuery] = useState("");

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

  const fetchAgentflows = useCallback(async () => {
    try {
      const res = await fetch("/api/agentflows");
      if (res.ok) {
        const flows = await res.json();
        const usage: Record<string, Set<string>> = {};
        const flowList = Array.isArray(flows) ? flows : (flows.agentflows || []);
        setRawFlows(flowList);
        for (const flow of flowList) {
          let nodes = flow.canvasDefinition?.nodes || [];
          if (typeof flow.canvasDefinition === "string") {
            try {
              nodes = JSON.parse(flow.canvasDefinition).nodes || [];
            } catch {}
          }
          for (const n of nodes) {
            const agentLabel = n.label || n.data?.label || "Agent";
            const tools = (n.tools || n.data?.tools || []).map((t: any) => typeof t === "string" ? t : (t?.name || ""));
            for (const t of tools) {
              const lower = String(t).toLowerCase().trim();
              if (!usage[lower]) usage[lower] = new Set();
              usage[lower].add(agentLabel);
            }
            const nodeSkills = (n.skills || n.data?.skills || []).map((s: any) => String(s).toLowerCase().trim());
            for (const s of nodeSkills) {
              if (!usage[s]) usage[s] = new Set();
              usage[s].add(agentLabel);
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
      console.error("Failed to fetch agentflows for skill usage mapping:", err);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
    fetchAgentflows();
  }, [fetchSkills, fetchAgentflows]);

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

  // Open Assign to Agents Modal
  const handleOpenAssignModal = (skill: Skill) => {
    setAssigningSkill(skill);
    setAssignSearchQuery("");
    const skillNameLower = skill.name.toLowerCase().trim();
    const skillIdLower = skill.id.toLowerCase().trim();
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
        const skillsList = (node.skills || node.data?.skills || []).map((s: any) =>
          String(s).toLowerCase().trim()
        );
        if (
          tools.includes(skillNameLower) ||
          tools.includes(skillIdLower) ||
          skillsList.includes(skillNameLower) ||
          skillsList.includes(skillIdLower)
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
    if (!assigningSkill) return;
    setSavingAssignments(true);
    try {
      const skillNameLower = assigningSkill.name.toLowerCase().trim();
      const skillIdLower = assigningSkill.id.toLowerCase().trim();
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
          const shouldHaveSkill = selectedAgentKeys.has(key);

          const currentTools: any[] = node.tools || node.data?.tools || [];
          const hasSkillInTools = currentTools.some((t: any) => {
            const tName = (typeof t === "string" ? t : t?.name || "").toLowerCase().trim();
            return tName === skillNameLower || tName === skillIdLower;
          });

          if (shouldHaveSkill && !hasSkillInTools) {
            const newToolRef = {
              id: `tool-ref-${crypto.randomUUID()}`,
              name: assigningSkill.name,
              category: assigningSkill.category,
              mcpServerId: assigningSkill.mcpServerId,
            };
            node.tools = [...currentTools, newToolRef];
            if (node.data) node.data.tools = node.tools;
            flowModified = true;
          } else if (!shouldHaveSkill && hasSkillInTools) {
            node.tools = currentTools.filter((t: any) => {
              const tName = (typeof t === "string" ? t : t?.name || "").toLowerCase().trim();
              return tName !== skillNameLower && tName !== skillIdLower;
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

      setAlertMessage(`Skill assigned successfully across ${updatedFlowCount} agentflow(s).`);
      setAssigningSkill(null);
      await fetchAgentflows();
    } catch (err) {
      console.error("Failed to save skill assignments:", err);
      setAlertMessage("Failed to update agent skill assignments. Please try again.");
    } finally {
      setSavingAssignments(false);
    }
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
          metadata[parts[0].trim().toLowerCase()] = parts.slice(1).join(":").trim().replace(/^['"]|['"]$/g, "");
        }
      });
      return {
        name: metadata.name || metadata.skillname || metadata.title || "",
        description: metadata.description || metadata.summary || metadata.descriptionsummary || "",
        instructions: body.trim() || "",
        category: (metadata.category as Skill["category"]) || "open",
        version: metadata.version || "1.0.0",
        mcpServerId: metadata.mcp_server_id || metadata.mcpserverid || metadata.binding_id || ""
      };
    }
    return { name: "", description: "", instructions: content.trim(), category: "custom" as const, version: "1.0.0", mcpServerId: "" };
  };

  const handleImportText = () => {
    if (!rawMarkdown.trim()) return;

    if (rawMarkdown.trim().startsWith("{")) {
      try {
        const data = JSON.parse(rawMarkdown);
        setFormName(data.name || data.skillName || data.title || "imported_skill");
        setFormDesc(data.description || data.summary || data.descriptionSummary || "Skill imported from JSON");
        setFormInstructions((data.instructions || data.markdownBody || data.content || data.body || "").replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n?/, "").trim());
        setFormCategory(data.category || "custom");
        setFormMcpServerId(data.mcpServerId || data.bindingId || data.serverId || "");
        setFormVersion(data.version || "1.0.0");
        setRawMarkdown("");
        setIsIngestModalOpen(false);
        setEditingSkill(null);
        setIsAuthorModalOpen(true);
        return;
      } catch {
        // Fall through to markdown parser
      }
    }

    const parsed = parseSkillMarkdown(rawMarkdown);
    setFormName(parsed.name || "imported_skill");
    setFormDesc(parsed.description || "Skill imported from text");
    setFormInstructions(parsed.instructions || rawMarkdown.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n?/, "").trim());
    setFormCategory(parsed.category);
    setFormMcpServerId(parsed.mcpServerId || "");
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
      if (!text) return;

      if (file.name.toLowerCase().endsWith(".json")) {
        try {
          const data = JSON.parse(text);
          setFormName(data.name || data.skillName || data.title || file.name.replace(/\.json$/i, "").toLowerCase().replace(/[^a-z0-9_]/g, "_"));
          setFormDesc(data.description || data.summary || data.descriptionSummary || `Skill imported from ${file.name}`);
          setFormInstructions((data.instructions || data.markdownBody || data.content || data.body || "").replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n?/, "").trim());
          setFormCategory(data.category || "custom");
          setFormMcpServerId(data.mcpServerId || data.bindingId || data.serverId || "");
          setFormVersion(data.version || "1.0.0");
          setIsIngestModalOpen(false);
          setEditingSkill(null);
          setIsAuthorModalOpen(true);
          return;
        } catch {
          // Fall through to markdown parser
        }
      }

      const parsed = parseSkillMarkdown(text);
      setFormName(parsed.name || file.name.replace(/\.(md|txt|json)$/i, "").toLowerCase().replace(/[^a-z0-9_]/g, "_"));
      setFormDesc(parsed.description || `Skill imported from ${file.name}`);
      setFormInstructions(parsed.instructions || text.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n?/, "").trim());
      setFormCategory(parsed.category);
      setFormMcpServerId(parsed.mcpServerId || "");
      setFormVersion(parsed.version);
      setIsIngestModalOpen(false);
      setEditingSkill(null);
      setIsAuthorModalOpen(true);
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
        if (fetchUrl.toLowerCase().endsWith(".json") || text.trim().startsWith("{")) {
          try {
            const data = JSON.parse(text);
            setFormName(data.name || data.skillName || data.title || "fetched_skill");
            setFormDesc(data.description || data.summary || data.descriptionSummary || `Skill fetched from ${fetchUrl}`);
            setFormInstructions((data.instructions || data.markdownBody || data.content || data.body || "").replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n?/, "").trim());
            setFormCategory(data.category || "custom");
            setFormMcpServerId(data.mcpServerId || data.bindingId || data.serverId || "");
            setFormVersion(data.version || "1.0.0");
            setFetchUrl("");
            setIsIngestModalOpen(false);
            setEditingSkill(null);
            setIsAuthorModalOpen(true);
            return;
          } catch {}
        }
        const parsed = parseSkillMarkdown(text);
        setFormName(parsed.name || "fetched_skill");
        setFormDesc(parsed.description || `Skill fetched from ${fetchUrl}`);
        setFormInstructions(parsed.instructions || text.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n?/, "").trim());
        setFormCategory(parsed.category);
        setFormMcpServerId(parsed.mcpServerId || "");
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
      const cleanInstructions = formInstructions.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n?/, "").trim();

      if (!editingSkill) {
        // Create mode
        const res = await fetch("/api/skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            description: formDesc,
            instructions: cleanInstructions,
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
            instructions: cleanInstructions,
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

  const handleExportCsv = () => {
    const headers = ["Skill Name", "Version", "Category", "Binding/Server ID", "Description", "Active Agents", "Created At"];
    const rows = filteredSkills.map(skill => {
      const boundAgents = (agentUsageMap[skill.name.toLowerCase()] || agentUsageMap[skill.id.toLowerCase()] || []).join("; ");
      return [
        `"${(skill.name || "").replace(/"/g, '""')}"`,
        `"${(skill.version || "1.0.0").replace(/"/g, '""')}"`,
        `"${(skill.category || "custom").replace(/"/g, '""')}"`,
        `"${(skill.mcpServerId || "").replace(/"/g, '""')}"`,
        `"${(skill.description || "").replace(/"/g, '""')}"`,
        `"${boundAgents.replace(/"/g, '""')}"`,
        `"${skill.createdAt || skill.updatedAt || ""}"`
      ].join(",");
    });
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "skills-registry-export.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      custom: "bg-primary/10 text-primary border-primary/20",
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
    <div className="flex-1 flex flex-col min-h-0 bg-card/20 rounded-2xl border border-border overflow-hidden">
      {/* â”€â”€ Top Header Controls Bar â”€â”€ */}
      <div className="p-4 border-b border-border bg-card flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        {/* Title & Counter */}
        <div className="flex items-center gap-3">
          <Wrench className="h-5 w-5 text-primary" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider font-mono">Universal Skills Registry</h2>
              <HelpTooltip content="Universal Agent Skills define procedural knowledge, code execution routines, and dynamic MCP endpoints." side="right" />
            </div>
            <span className="text-[11px] text-muted-foreground">
              Total: <strong className="text-foreground">{filteredSkills.length}</strong> skills persisted
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          {canExportSkill && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border hover:border-border bg-muted/50 hover:bg-muted text-foreground hover:text-foreground text-xs font-semibold transition-all shadow-sm cursor-pointer"
              title="Export all skills to CSV"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" /> Export CSV
            </button>
          )}
          {canImportSkill && (
            <button
              type="button"
              onClick={() => setIsIngestModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border hover:border-border bg-muted/50 hover:bg-muted text-foreground hover:text-foreground text-xs font-semibold transition-all shadow-sm cursor-pointer"
            >
              <Upload className="h-4 w-4 text-muted-foreground" /> Import / Ingest
            </button>
          )}
          {canCreateSkill && (
            <button
              type="button"
              onClick={handleOpenAuthorModal}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Author New Skill
            </button>
          )}
        </div>
      </div>

      {/* â”€â”€ Search, Filter & Sort Toolbar â”€â”€ */}
      <div className="p-3.5 border-b border-border bg-card flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
        {/* Real-time search */}
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills by name, description, server ID..."
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

        {/* Filter Pills and Sort dropdown */}
        <div className="flex items-center gap-3 overflow-x-auto">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 bg-muted/30 p-1 rounded-xl border border-border">
            {categoryFilterOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedCategoryFilter(opt.value)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                  selectedCategoryFilter === opt.value
                    ? "bg-primary/20 border-indigo-500/50 text-primary shadow-sm"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-muted border border-border text-xs text-foreground rounded-xl px-2.5 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="updated">Recently Updated</option>
              <option value="name">Name (A-Z)</option>
              <option value="category">Category</option>
            </select>
          </div>
        </div>
      </div>

      {/* â”€â”€ Full-Width Data Table â”€â”€ */}
      <div className="flex-1 overflow-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted">
        {loading && skills.length === 0 ? (
          <div className="flex flex-col justify-center items-center py-24 text-muted-foreground text-xs gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span>Loading registered skills...</span>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="text-center py-24 px-4 space-y-3">
            <FolderOpen className="h-10 w-10 text-slate-700 mx-auto" />
            <p className="text-foreground text-sm font-semibold">
              {searchQuery || selectedCategoryFilter !== "All" ? "No skills match your search filters." : "No skills registered yet."}
            </p>
            <p className="text-muted-foreground text-xs max-w-sm mx-auto">
              {searchQuery || selectedCategoryFilter !== "All" 
                ? "Try adjusting your query or resetting the category filter tab." 
                : "Author a new skill or import an existing SKILL.md or .json bundle to get started."}
            </p>
            <button
              type="button"
              onClick={handleOpenAuthorModal}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold transition-all shadow-md shadow-primary/20 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Author New Skill
            </button>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-[10px] uppercase font-bold text-muted-foreground font-mono tracking-wider">
                <th className="py-3 px-4">Skill Name &amp; Key</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Binding / Server ID</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Active In Agents</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {filteredSkills.map((skill) => {
                const boundAgents = agentUsageMap[skill.name.toLowerCase()] || agentUsageMap[skill.id.toLowerCase()] || [];
                return (
                  <tr 
                    key={skill.id}
                    className="group hover:bg-muted/30 transition-colors text-xs"
                  >
                    {/* Name & Version */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground group-hover:text-primary transition-colors">
                          {skill.name}
                        </span>
                        <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
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
                        <span className="text-muted-foreground text-[11px] font-mono">Local Sandbox</span>
                      )}
                    </td>

                    {/* Description */}
                    <td className="py-3.5 px-4 max-w-md">
                      <p className="text-muted-foreground truncate text-[11px] leading-relaxed" title={skill.description}>
                        {skill.description}
                      </p>
                    </td>

                    {/* Active In Agents */}
                    <td className="py-3.5 px-4 max-w-[220px]">
                      {boundAgents.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleOpenAssignModal(skill)}
                          className="flex flex-wrap items-center gap-1 text-left group/badge cursor-pointer p-1 rounded-lg hover:bg-muted transition-colors"
                          title="Click to manage agent assignments"
                        >
                          {boundAgents.slice(0, 2).map((agent, idx) => (
                            <span key={idx} className="text-[10px] bg-primary/10 text-primary group-hover/badge:border-indigo-400 px-2 py-0.5 rounded-md border border-primary/20 font-medium transition-colors">
                              {agent}
                            </span>
                          ))}
                          {boundAgents.length > 2 && (
                            <span className="text-[9px] text-muted-foreground font-mono group-hover/badge:text-foreground" title={boundAgents.slice(2).join(", ")}>
                              +{boundAgents.length - 2}
                            </span>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenAssignModal(skill)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-dashed border-border text-muted-foreground hover:text-primary hover:border-indigo-500/40 hover:bg-indigo-950/20 text-[10px] font-medium transition-all cursor-pointer"
                          title="Assign this skill to specialist agents"
                        >
                          <Plus className="h-2.5 w-2.5" /> Assign Agents
                        </button>
                      )}
                    </td>

                    {/* Actions Group */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Inspect/View */}
                        <button
                          type="button"
                          onClick={() => setViewingSkill(skill)}
                          className="p-1.5 rounded-lg border border-border hover:border-border bg-muted/40 hover:bg-muted text-foreground hover:text-foreground transition-all cursor-pointer"
                          title="Inspect Blueprint"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>

                        {/* Edit */}
                        {canEditSkill && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(skill)}
                            className="p-1.5 rounded-lg border border-border hover:border-indigo-500/40 bg-muted/40 hover:bg-indigo-950/20 text-foreground hover:text-primary transition-all cursor-pointer"
                            title="Edit Skill"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Export Dropdown */}
                        {canExportSkill && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setActiveExportMenuId(activeExportMenuId === skill.id ? null : skill.id)}
                              className="p-1.5 rounded-lg border border-border hover:border-border bg-muted/40 hover:bg-muted text-foreground hover:text-foreground transition-all cursor-pointer"
                              title="Export Options"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>

                            {activeExportMenuId === skill.id && (
                              <div className="absolute right-0 top-full mt-1 w-32 bg-card border border-border rounded-xl shadow-2xl py-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                                <button
                                  type="button"
                                  onClick={() => handleExportMarkdown(skill)}
                                  className="w-full px-3 py-1.5 text-left text-xs text-foreground hover:text-foreground hover:bg-muted flex items-center gap-2 cursor-pointer"
                                >
                                  <FileText className="h-3.5 w-3.5 text-primary" /> Export .md
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleExportJson(skill)}
                                  className="w-full px-3 py-1.5 text-left text-xs text-foreground hover:text-foreground hover:bg-muted flex items-center gap-2 cursor-pointer"
                                >
                                  <Code className="h-3.5 w-3.5 text-amber-400" /> Export JSON
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Delete */}
                        {canDeleteSkill && (
                          <button
                            type="button"
                            onClick={() => setDeletingSkill(skill)}
                            className="p-1.5 rounded-lg border border-border hover:border-red-500/40 bg-muted/40 hover:bg-red-950/20 text-muted-foreground hover:text-red-400 transition-all cursor-pointer"
                            title="Delete Skill"
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

      {/* â”€â”€ 1. Ingestion Modal â”€â”€ */}
      {isIngestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setIsIngestModalOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-card">
              <div className="flex items-center gap-2.5">
                <Upload className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Import &amp; Ingest Skill</h3>
              </div>
              <button onClick={() => setIsIngestModalOpen(false)} className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Tab selector */}
              <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setIngestTab("file")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    ingestTab === "file" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Upload SKILL.md / JSON File
                </button>
                <button
                  type="button"
                  onClick={() => setIngestTab("paste")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    ingestTab === "paste" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Paste Raw Markdown / JSON
                </button>
                <button
                  type="button"
                  onClick={() => setIngestTab("url")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    ingestTab === "url" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Fetch from URL
                </button>
              </div>

              {ingestTab === "file" && (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-primary/20 hover:border-indigo-500/60 bg-indigo-950/10 hover:bg-indigo-950/20 rounded-2xl p-8 cursor-pointer transition-all">
                  <Upload className="h-8 w-8 text-primary mb-2" />
                  <span className="text-sm text-foreground font-bold">Drop SKILL.md Blueprint / JSON File</span>
                  <span className="text-xs text-muted-foreground mt-1">Automatically hydrates YAML frontmatter/JSON metadata and instructions</span>
                  <input type="file" accept=".md,.json,.txt" onChange={handleFileUpload} className="hidden" />
                </label>
              )}

              {ingestTab === "paste" && (
                <div className="space-y-3">
                  <textarea 
                    rows={8} 
                    value={rawMarkdown}
                    onChange={(e) => setRawMarkdown(e.target.value)}
                    placeholder="---\nname: my_custom_skill\ndescription: A useful agent tool\ncategory: custom\nversion: 1.0.0\n---\n\n# Instructions..."
                    className="w-full rounded-2xl border border-border bg-muted/30 p-4 text-xs text-foreground font-mono placeholder-slate-655 outline-none focus:border-indigo-500"
                  />
                  <button 
                    type="button" 
                    onClick={handleImportText}
                    className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 cursor-pointer"
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
                      className="flex-1 rounded-xl border border-border bg-muted/50 py-2 px-3.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500"
                    />
                    <button 
                      type="button" 
                      onClick={handleFetchUrl} 
                      disabled={importing}
                      className="px-4 rounded-xl bg-primary hover:bg-primary text-primary-foreground text-xs font-bold shrink-0 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                      Fetch
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Provide an accessible raw markdown or JSON URL from GitHub, skills.sh, or an agent skill repository.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ 2. View / Inspect Modal â”€â”€ */}
      {viewingSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setViewingSkill(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-card shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <BookOpen className="h-5 w-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold font-mono text-foreground truncate">{viewingSkill.name}</h3>
                    {renderBadge(viewingSkill.category)}
                    <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
                      v{viewingSkill.version}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button 
                  type="button" 
                  onClick={() => handleExportMarkdown(viewingSkill)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border hover:border-border bg-muted/50 text-foreground hover:text-foreground text-xs font-semibold transition-all cursor-pointer"
                  title="Download Markdown Blueprint"
                >
                  <Download className="h-3.5 w-3.5" /> .md
                </button>
                <button 
                  type="button" 
                  onClick={() => handleExportJson(viewingSkill)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border hover:border-border bg-muted/50 text-foreground hover:text-foreground text-xs font-semibold transition-all cursor-pointer"
                  title="Download JSON Payload"
                >
                  <Download className="h-3.5 w-3.5" /> JSON
                </button>
                <button 
                  type="button" 
                  onClick={() => handleOpenEditModal(viewingSkill)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 cursor-pointer"
                >
                  <Edit className="h-3.5 w-3.5" /> Edit Skill
                </button>
                <button onClick={() => setViewingSkill(null)} className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg ml-2 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-card border border-border p-4 rounded-2xl text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold mb-0.5">Category</span>
                  <span className="text-foreground capitalize font-medium">{viewingSkill.category}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold mb-0.5">Version</span>
                  <span className="text-foreground font-mono font-medium">v{viewingSkill.version}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold mb-0.5">Binding / Execution</span>
                  <span className="text-primary font-mono font-medium">{viewingSkill.mcpServerId || "Local Sandbox Function"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold mb-0.5">Active In Agents</span>
                  <span className="text-primary font-medium font-mono text-[11px]">
                    {(agentUsageMap[viewingSkill.name.toLowerCase()] || agentUsageMap[viewingSkill.id.toLowerCase()] || []).join(", ") || "None"}
                  </span>
                </div>
              </div>

              {/* Description Card */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Description</span>
                <div className="text-xs text-foreground leading-relaxed bg-card border border-border p-4 rounded-2xl">
                  {viewingSkill.description}
                </div>
              </div>

              {/* Instructions / SKILL.md Body */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Instructions &amp; Schema Blueprint (SKILL.md)</span>
                  <button
                    type="button"
                    onClick={() => handleCopyInstructions(viewingSkill.instructions)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors bg-muted/60 hover:bg-muted px-3 py-1 rounded-lg border border-border cursor-pointer"
                  >
                    {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedCode ? "Copied" : "Copy Raw Instructions"}
                  </button>
                </div>
                <pre className="rounded-2xl border border-border bg-muted/30 p-4 text-xs text-foreground font-mono overflow-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted whitespace-pre-wrap leading-relaxed max-h-[350px]">
                  {viewingSkill.instructions}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ 3. Author / Edit Modal â”€â”€ */}
      {isAuthorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setIsAuthorModalOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-card shrink-0">
              <div className="flex items-center gap-2.5">
                <Edit className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  {editingSkill ? `Edit Skill: ${formName}` : "Create Custom Skill Definition"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsAuthorModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-xs font-semibold transition-all bg-card/20 cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleSaveSkill}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary hover:bg-primary text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {editingSkill ? "Publish & Increment Patch" : "Save Skill"}
                </button>
                <button onClick={() => setIsAuthorModalOpen(false)} className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg ml-2 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Skill Name (Unique Identifier)</label>
                    <HelpTooltip content="A unique, snake_case identifier for this skill. Used for programmatic binding in agent configurations. Cannot be changed after creation." side="right" />
                  </div>
                  <input 
                    type="text" 
                    value={formName}
                    onChange={(e) => setFormName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                    placeholder="e.g. compile_visual_canvas" 
                    className="w-full rounded-xl border border-border bg-muted/20 py-2.5 px-4 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500 font-mono disabled:opacity-60"
                    disabled={Boolean(editingSkill)}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Category</label>
                    <HelpTooltip content="Determines how the skill is executed: Custom (local JS), Open (YAML+Markdown), Native (TS system), or MCP (bound to a tool server)." side="right" />
                  </div>
                  <select 
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as Skill["category"])}
                    className="w-full rounded-xl border border-border bg-background py-2.5 px-4 text-xs text-foreground outline-none focus:border-indigo-500 cursor-pointer"
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
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">MCP Server Identifier</label>
                  <input 
                    type="text" 
                    value={formMcpServerId}
                    onChange={(e) => setFormMcpServerId(e.target.value)}
                    placeholder="e.g. StitchMCP or wedplanai-prod" 
                    className="w-full rounded-xl border border-border bg-muted/20 py-2.5 px-4 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Brief Summary / Description</label>
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
                  className="w-full rounded-xl border border-border bg-muted/20 py-2.5 px-4 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Instructions &amp; Schema body (SKILL.md Blueprint)</label>
                    <HelpTooltip content="The full skill definition in SKILL.md format — YAML frontmatter or Markdown instructions for agent consumption." side="right" />
                    <AiAssistButton
                      onGenerated={(text) => setFormInstructions(text)}
                      mode="all"
                      domain="skill"
                      placeholder="Describe the skill logic, tools, and behavior you want to define..."
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-semibold">Template:</span>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const key = e.target.value;
                        if (!key || !SKILL_TEMPLATES[key]) return;
                        if (
                          formInstructions.trim() &&
                          !window.confirm("Replace current instructions with the selected blueprint template?")
                        ) {
                          e.target.value = "";
                          return;
                        }
                        const t = SKILL_TEMPLATES[key];
                        setFormInstructions(t.template);
                        if (t.category && !editingSkill) {
                          setFormCategory(t.category);
                        }
                        e.target.value = "";
                      }}
                      className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-foreground outline-none focus:border-primary cursor-pointer shadow-xs"
                    >
                      <option value="" disabled>Load Blueprint Template...</option>
                      {Object.entries(SKILL_TEMPLATES).map(([k, t]) => (
                        <option key={k} value={k}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <MarkdownEditor 
                  value={formInstructions}
                  onChange={setFormInstructions}
                  placeholder="# SKILL BLUEPRINT..."
                  minHeight="320px"
                  maxHeight="520px"
                />
              </div>
            </div>

            {/* Sticky Modal Footer */}
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
                onClick={handleSaveSkill}
                disabled={loading}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-primary text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 disabled:opacity-50 cursor-pointer"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingSkill ? "Publish & Increment Patch" : "Save Skill"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ 4. Delete Confirmation Modal â”€â”€ */}
      {deletingSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setDeletingSkill(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-3xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground">Delete Skill</h3>
              <button onClick={() => setDeletingSkill(null)} className="text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-foreground mb-6 leading-relaxed">
              Are you sure you want to delete <strong className="text-foreground font-mono">{deletingSkill.name}</strong>? This action is permanent and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeletingSkill(null)}
                className="flex-1 py-2 rounded-xl border border-border hover:border-border text-muted-foreground hover:text-foreground text-xs font-semibold bg-muted/40 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSkill(deletingSkill.id)}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-foreground text-xs font-bold transition-all cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ 5. Assign to Agents Modal â”€â”€ */}
      {assigningSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div onClick={() => setAssigningSkill(null)} className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-3xl shadow-2xl p-6 w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 border border-indigo-500/20 text-primary">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    Assign Skill to Agents
                    <span className="font-mono text-primary font-normal">({assigningSkill.name})</span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Bind or unbind this skill across worker agents in your published and draft flows.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssigningSkill(null)}
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
                  className="w-full rounded-xl border border-border bg-muted/50 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Flows & Agents List */}
            <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted">
              {rawFlows.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-xs">
                  No agentflows found. Create an agentflow in Capability Studio to assign skills.
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
                                  ? "bg-indigo-950/30 border-indigo-500/50 text-foreground"
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
                  onClick={() => setAssigningSkill(null)}
                  className="px-4 py-2 rounded-xl border border-border hover:border-border text-muted-foreground hover:text-foreground text-xs font-semibold bg-muted/40 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAssignments}
                  disabled={savingAssignments}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-primary text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 disabled:opacity-50 cursor-pointer"
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


