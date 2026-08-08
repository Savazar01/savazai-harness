"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ShieldCheck,
  Loader2,
  Save,
  CheckCircle2,
  XCircle,
  Plus,
  X,
  Terminal,
  Activity,
  RefreshCw,
  Info,
  Upload,
  FileSpreadsheet,
  Eye,
  Sparkles,
  WandSparkles,
  Braces,
  FileDown,
} from "lucide-react";
import type { ComplianceConfig, ComplianceEntityRule, ImportedFramework, ImportedFrameworkEntity, KeywordRule } from "@/app/api/governance/compliance/route";
import { HelpTooltip } from "@/components/shared/help-tooltip";

const FRAMEWORKS = [
  { key: "hipaa", label: "HIPAA (PHI)", description: "Health Insurance Portability and Accountability Act" },
  { key: "pci", label: "PCI-DSS (Financial)", description: "Payment Card Industry Data Security Standard" },
  { key: "gdpr", label: "GDPR / CCPA (PII/SPI)", description: "General Data Protection Regulation / California Consumer Privacy Act" },
];

const FRAMEWORK_SCOPE: Record<string, { regulatoryReference: string; entities: { key: string; label: string }[]; enforcementStrategy: string }> = {
  hipaa: {
    regulatoryReference: "HIPAA 45 CFR § 164.514",
    entities: [
      { key: "person_name", label: "Person Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone Number" },
      { key: "ssn", label: "SSN / National ID" },
      { key: "location", label: "Location" },
    ],
    enforcementStrategy: "Mask — All PHI entities are redacted with [ENTITY_REDACTED] placeholders per HIPAA Safe Harbor method."
  },
  pci: {
    regulatoryReference: "PCI-DSS v4.0 Requirement 3",
    entities: [
      { key: "credit_card", label: "Credit Card / CVV" },
      { key: "iban", label: "IBAN / Bank Account" },
      { key: "person_name", label: "Person Name" },
    ],
    enforcementStrategy: "Block — Credit card data is blocked/rejected entirely. IBAN and Person Name are masked."
  },
  gdpr: {
    regulatoryReference: "GDPR Article 4/32, CCPA §1798.81.5",
    entities: [
      { key: "person_name", label: "Person Name" },
      { key: "email", label: "Email" },
      { key: "ip_address", label: "IP Address" },
      { key: "location", label: "Location" },
    ],
    enforcementStrategy: "Tokenize — PII/SPI identifiers are replaced with contextual tokens (<EMAIL_1>, <PERSON_1>) for correlation safety."
  },
};

const ENTITY_ACTIONS: { value: ComplianceEntityRule["action"]; label: string }[] = [
  { value: "mask", label: "Mask" },
  { value: "tokenize", label: "Tokenize" },
  { value: "block", label: "Block" },
];

const REGEX_PRESETS = [
  { label: "Employee ID (EMP-12345)", pattern: "\\bEMP-\\d{4,6}\\b" },
  { label: "Invoice # (INV-2024-001)", pattern: "\\bINV-\\d{4}-\\d{3,6}\\b" },
  { label: "Order Ref (ORD-ABC123)", pattern: "\\bORD-[A-Z]{3}\\d{3,6}\\b" },
  { label: "Serial (SN-XXXX-1234)", pattern: "\\bSN-[A-Z]{4}-\\d{4,8}\\b" },
  { label: "Hex Token (0x...)", pattern: "\\b0x[a-fA-F0-9]{16,64}\\b" },
];

interface AuditLogEntry {
  timestamp: string;
  operation: "mask" | "unmask";
  categories: { type: string; count: number; label: string }[];
  totalMasked: number;
  frameworkTriggered?: string;
  entitiesMasked?: string[];
}

const SAMPLE_DPDP_JSON = `{
  "framework_id": "dpdp_act_2023",
  "name": "DPDP Act 2023 (India)",
  "regulatory_reference": "Digital Personal Data Protection Act 2023 § 2(t), § 6-9",
  "description": "Indian digital personal data protection framework for Aadhaar, PAN, and phone numbers",
  "entities": [
    {
      "entity_key": "aadhaar",
      "label": "Aadhaar Number",
      "default_action": "mask",
      "pattern": "\\\\b\\\\d{4}\\\\s?\\\\d{4}\\\\s?\\\\d{4}\\\\b"
    },
    {
      "entity_key": "pan_card",
      "label": "PAN Card",
      "default_action": "mask",
      "pattern": "\\\\b[A-Z]{5}\\\\d{4}[A-Z]\\\\b"
    },
    {
      "entity_key": "indian_phone",
      "label": "Indian Phone Number",
      "default_action": "tokenize",
      "pattern": "\\\\b(?:\\\\+91|0)?[6-9]\\\\d{9}\\\\b"
    }
  ]
}`;

const SAMPLE_SOC2_CSV = `framework_id,name,regulatory_reference,description,entity_key,label,default_action,pattern
soc2_internal,SOC 2 (Internal),SOC 2 CC6.1 / CC6.6,"SOC 2 internal security controls for tokens, IPs, and hostnames",internal_token,Internal Access Token,block,\\\\b(?:sk|pk)_[A-Za-z0-9]{20,}\\\\b
soc2_internal,SOC 2 (Internal),SOC 2 CC6.1 / CC6.6,"SOC 2 internal security controls for tokens, IPs, and hostnames",internal_ip,Internal IP Range,block,\\\\b(?:10\\\\.\\\\d{1,3}\\\\.\\\\d{1,3}\\\\.\\\\d{1,3}|172\\\\.(?:1[6-9]|2\\\\d|3[01])\\\\.\\\\d{1,3}\\\\.\\\\d{1,3}|192\\\\.168\\\\.\\\\d{1,3}\\\\.\\\\d{1,3})\\\\b
soc2_internal,SOC 2 (Internal),SOC 2 CC6.1 / CC6.6,"SOC 2 internal security controls for tokens, IPs, and hostnames",server_hostname,Server Hostname,mask,\\\\b(?:db|api|app|admin)-[a-z]+\\\\.internal\\\\.com\\\\b`;

export function ComplianceManager() {
  const [tab, setTab] = useState<"rules" | "stream">("rules");
  const [frameworks, setFrameworks] = useState<string[]>([]);
  const [entityRules, setEntityRules] = useState<ComplianceEntityRule[]>([]);
  const [customKeywords, setCustomKeywords] = useState<KeywordRule[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywordAction, setKeywordAction] = useState<"mask" | "tokenize" | "block">("mask");
  const [customRegex, setCustomRegex] = useState<{ pattern: string; label: string }[]>([]);
  const [regexLabel, setRegexLabel] = useState("");
  const [regexPattern, setRegexPattern] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Imported frameworks
  const [importedFrameworks, setImportedFrameworks] = useState<ImportedFramework[]>([]);
  const [scopeInfoFramework, setScopeInfoFramework] = useState<string | null>(null);
  const [scopeInfoImported, setScopeInfoImported] = useState<ImportedFramework | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add Entity modal
  const [addEntityModalOpen, setAddEntityModalOpen] = useState(false);
  const [newEntityLabel, setNewEntityLabel] = useState("");
  const [newEntityKey, setNewEntityKey] = useState("");
  const [newEntityAction, setNewEntityAction] = useState<"mask" | "tokenize" | "block">("mask");
  const [newEntityPattern, setNewEntityPattern] = useState("");

  // AI Regex Generator modal
  const [aiRegexModalOpen, setAiRegexModalOpen] = useState(false);
  const [aiRegexSample, setAiRegexSample] = useState("");
  const [aiRegexLabel, setAiRegexLabel] = useState("");
  const [aiRegexGenerating, setAiRegexGenerating] = useState(false);
  const [aiRegexResult, setAiRegexResult] = useState<{ pattern: string; explanation?: string } | null>(null);
  const [aiRegexError, setAiRegexError] = useState<string | null>(null);

  // Audit stream state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [streamActive, setStreamActive] = useState(true);
  const logsEndRef = React.useRef<HTMLDivElement>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/governance/compliance");
      if (res.ok) {
        const data = (await res.json()) as ComplianceConfig;
        setFrameworks(data.frameworks || []);
        setEntityRules(data.entityRules || []);
        setCustomKeywords(data.customKeywords || []);
        setCustomRegex(data.customRegex || []);
        setImportedFrameworks(data.importedFrameworks || []);
      }
    } catch (err) {
      console.error("Failed to load compliance config:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/governance/logs");
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchConfig(); }, [fetchConfig]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (tab === "stream") fetchLogs(); }, [tab, fetchLogs]);
  useEffect(() => {
    if (tab !== "stream") return;
    let interval: NodeJS.Timeout;
    if (streamActive) {
      interval = setInterval(fetchLogs, 5000);
    }
    return () => clearInterval(interval);
  }, [tab, streamActive, fetchLogs]);
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [auditLogs]);

  const toggleFramework = (key: string) => {
    setFrameworks((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  };

  const toggleImportedFramework = (fwId: string) => {
    setImportedFrameworks((prev) =>
      prev.map((fw) => fw.framework_id === fwId ? { ...fw, active: !(fw.active ?? true) } : fw)
    );
  };

  const updateEntityAction = (entity: string, action: ComplianceEntityRule["action"]) => {
    setEntityRules((prev) =>
      prev.map((r) => (r.entity === entity ? { ...r, action } : r))
    );
  };

  const toggleEntityEnabled = (entity: string) => {
    setEntityRules((prev) =>
      prev.map((r) => (r.entity === entity ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const addKeyword = () => {
    const trimmed = keywordInput.trim();
    if (!trimmed || customKeywords.some((k) => k.keyword === trimmed)) return;
    setCustomKeywords((prev) => [...prev, { keyword: trimmed, action: keywordAction }]);
    setKeywordInput("");
  };

  const removeKeyword = (kw: string) => {
    setCustomKeywords((prev) => prev.filter((k) => k.keyword !== kw));
  };

  const updateKeywordAction = (kw: string, action: "mask" | "tokenize" | "block") => {
    setCustomKeywords((prev) =>
      prev.map((k) => k.keyword === kw ? { ...k, action } : k)
    );
  };

  const addRegex = () => {
    if (!regexLabel.trim() || !regexPattern.trim()) return;
    setCustomRegex((prev) => [...prev, { pattern: regexPattern.trim(), label: regexLabel.trim() }]);
    setRegexLabel("");
    setRegexPattern("");
  };

  const removeRegex = (idx: number) => {
    setCustomRegex((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeImportedFramework = (fwId: string) => {
    setImportedFrameworks((prev) => prev.filter((fw) => fw.framework_id !== fwId));
  };

  // Add custom entity
  const handleAddEntity = () => {
    if (!newEntityLabel.trim() || !newEntityKey.trim()) return;
    if (entityRules.some((r) => r.entity === newEntityKey.trim())) return;
    const newRule: ComplianceEntityRule = {
      entity: newEntityKey.trim(),
      label: newEntityLabel.trim(),
      action: newEntityAction,
      enabled: true,
    };
    setEntityRules((prev) => [...prev, newRule]);
    setAddEntityModalOpen(false);
    setNewEntityLabel("");
    setNewEntityKey("");
    setNewEntityAction("mask");
    setNewEntityPattern("");
  };

  // Derived entity-to-framework badges
  const entityActiveFrameworks: Record<string, string[]> = {};
  for (const fwKey of frameworks) {
    const scope = FRAMEWORK_SCOPE[fwKey];
    if (scope) {
      for (const ent of scope.entities) {
        if (!entityActiveFrameworks[ent.key]) entityActiveFrameworks[ent.key] = [];
        entityActiveFrameworks[ent.key].push(FRAMEWORKS.find(f => f.key === fwKey)?.label || fwKey.toUpperCase());
      }
    }
  }
  for (const fw of importedFrameworks) {
    if (fw.active !== false) {
      for (const ent of fw.entities) {
        if (!entityActiveFrameworks[ent.entity_key]) entityActiveFrameworks[ent.entity_key] = [];
        entityActiveFrameworks[ent.entity_key].push(fw.name);
      }
    }
  }

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/governance/compliance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameworks, entityRules, customKeywords, customRegex, importedFrameworks } satisfies ComplianceConfig),
      });
      if (res.ok) {
        setStatus({ type: "success", message: "Compliance rules saved and activated." });
      } else {
        const err = await res.json();
        setStatus({ type: "error", message: err.error || "Failed to save." });
      }
    } catch {
      setStatus({ type: "error", message: "Network error saving compliance rules." });
    } finally {
      setSaving(false);
    }
  };

  // ── Import parsing ──
  const parseImportedFile = (text: string, fileName: string): ImportedFramework[] => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "json") {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr.map(validateImportedFramework);
    }
    if (ext === "csv") {
      return parseCsvImports(text);
    }
    throw new Error("Unsupported file format. Please upload a .json or .csv file.");
  };

  const parseCsvImports = (csv: string): ImportedFramework[] => {
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");
    const headers = lines[0].split(",").map(h => h.trim());
    const requiredHeaders = ["framework_id", "name", "regulatory_reference", "description", "entity_key", "label", "default_action"];
    for (const rh of requiredHeaders) {
      if (!headers.includes(rh)) throw new Error(`CSV missing required column: "${rh}". Required: ${requiredHeaders.join(", ")}`);
    }
    const frameworkMap = new Map<string, ImportedFramework>();
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const vals = line.split(",").map(v => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
      if (!row.framework_id) continue;
      if (!frameworkMap.has(row.framework_id)) {
        const fw: ImportedFramework = {
          framework_id: row.framework_id,
          name: row.name || row.framework_id,
          regulatory_reference: row.regulatory_reference || "",
          description: row.description || "",
          entities: [],
          active: true,
        };
        validateImportedFramework(fw);
        frameworkMap.set(row.framework_id, fw);
      }
      const fw = frameworkMap.get(row.framework_id)!;
      const ent: ImportedFrameworkEntity = {
        entity_key: row.entity_key,
        label: row.label || row.entity_key,
        default_action: (row.default_action as "mask" | "tokenize" | "block") || "mask",
        pattern: row.pattern || undefined,
      };
      if (ent.entity_key && !fw.entities.some(e => e.entity_key === ent.entity_key)) {
        fw.entities.push(ent);
      }
    }
    return Array.from(frameworkMap.values());
  };

  const validateImportedFramework = (fw: ImportedFramework): ImportedFramework => {
    if (!fw.framework_id) throw new Error("Imported framework missing required field: framework_id");
    if (!fw.name) fw.name = fw.framework_id;
    if (!fw.regulatory_reference) fw.regulatory_reference = "Custom — No regulatory reference specified";
    if (!fw.entities || !Array.isArray(fw.entities)) throw new Error(`Framework "${fw.framework_id}" missing entities array.`);
    for (const ent of fw.entities) {
      if (!ent.entity_key) throw new Error(`Entity in framework "${fw.framework_id}" missing entity_key.`);
      if (!ent.default_action) ent.default_action = "mask";
      if (!["mask", "tokenize", "block"].includes(ent.default_action)) ent.default_action = "mask";
      if (!ent.label) ent.label = ent.entity_key;
    }
    if (fw.active === undefined) fw.active = true;
    return fw;
  };

  const handleFileDrop = async (file: File) => {
    setImportError(null);
    setImportSuccess(null);
    try {
      const text = await file.text();
      const parsed = parseImportedFile(text, file.name);
      setImportedFrameworks((prev) => {
        const existingIds = new Set(prev.map(f => f.framework_id));
        const newOnes = parsed.filter(f => !existingIds.has(f.framework_id));
        setEntityRules((prevRules) => {
          const newRules = [...prevRules];
          for (const fw of newOnes) {
            for (const ent of fw.entities) {
              if (!newRules.some(r => r.entity === ent.entity_key)) {
                newRules.push({
                  entity: ent.entity_key,
                  label: ent.label,
                  action: ent.default_action,
                  enabled: true,
                });
              }
            }
          }
          return newRules;
        });
        return [...prev, ...newOnes];
      });
      setImportSuccess(`Successfully imported ${parsed.length} framework(s): ${parsed.map(f => f.name).join(", ")}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to parse file.");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileDrop(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileDrop(file);
  };

  const downloadSampleJson = () => {
    const blob = new Blob([SAMPLE_DPDP_JSON], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "dpdp_act_sample.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_SOC2_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "soc2_sample.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── AI Regex Generator ──
  const handleGenerateRegex = async () => {
    if (!aiRegexSample.trim()) return;
    setAiRegexGenerating(true);
    setAiRegexError(null);
    setAiRegexResult(null);
    try {
      const res = await fetch("/api/governance/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample: aiRegexSample.trim(), label: aiRegexLabel.trim() || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiRegexResult({ pattern: data.pattern, explanation: data.explanation });
      } else {
        const err = await res.json();
        setAiRegexError(err.error || "Failed to generate pattern.");
      }
    } catch {
      setAiRegexError("Network error generating regex pattern.");
    } finally {
      setAiRegexGenerating(false);
    }
  };

  const applyAiRegex = () => {
    if (!aiRegexResult) return;
    setRegexLabel(aiRegexLabel.trim() || `AI: ${aiRegexSample.slice(0, 20)}`);
    setRegexPattern(aiRegexResult.pattern);
    setAiRegexModalOpen(false);
    setAiRegexSample("");
    setAiRegexLabel("");
    setAiRegexResult(null);
    setAiRegexError(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-xs gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading compliance configuration...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-0">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-900 pb-3 mb-4 shrink-0">
        <button
          type="button"
          onClick={() => setTab("rules")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            tab === "rules" ? "bg-indigo-600/10 text-indigo-300 border border-indigo-500/30" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5 inline mr-1.5" />
          Compliance Rules
        </button>
        <button
          type="button"
          onClick={() => setTab("stream")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            tab === "stream" ? "bg-indigo-600/10 text-indigo-300 border border-indigo-500/30" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Terminal className="h-3.5 w-3.5 inline mr-1.5" />
          Gateway Masking Audit Stream
        </button>
      </div>

      {tab === "rules" && (
        <div className="flex-1 overflow-y-auto space-y-6 pr-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800">
          {status && (
            <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs ${
              status.type === "success" ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-400" : "border-red-500/25 bg-red-500/5 text-red-400"
            }`}>
              {status.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
              {status.message}
            </div>
          )}

          {/* Compliance Framework Presets */}
          <div className="rounded-2xl border border-slate-900 bg-slate-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white">Compliance Framework Presets</h3>
                  <p className="text-[10px] text-slate-500">Toggle frameworks to auto-configure entity masking rules.</p>
                </div>
                <HelpTooltip content="Framework Presets auto-configure entity rules for regulatory standards (HIPAA, PCI-DSS, GDPR/CCPA). Toggle a preset to automatically enforce its entity masking strategies across the pipeline." side="right" />
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800/50 text-slate-300 hover:text-white text-xs font-bold transition-all"
              >
                <Upload className="h-3.5 w-3.5" />
                Import Custom Framework
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {FRAMEWORKS.map((fw) => {
                const active = frameworks.includes(fw.key);
                return (
                  <div key={fw.key} className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => toggleFramework(fw.key)}
                      className={`px-4 py-2.5 rounded-l-xl text-xs font-bold border border-r-0 transition-all ${
                        active
                          ? "bg-indigo-600/10 border-indigo-500/40 text-indigo-300 shadow-sm shadow-indigo-600/5"
                          : "bg-slate-900/30 border-slate-800 text-slate-500 hover:border-slate-700"
                      }`}
                    >
                      <div className="text-left">
                        <div>{fw.label}</div>
                        <div className="text-[8px] font-normal text-slate-500 mt-0.5">{fw.description}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setScopeInfoFramework(fw.key); setScopeInfoImported(null); }}
                      title="Inspect Scope"
                      className={`px-2 rounded-r-xl border text-xs font-bold transition-all ${
                        active
                          ? "bg-indigo-600/10 border-indigo-500/40 text-indigo-400 hover:text-indigo-200 border-l-0"
                          : "bg-slate-900/30 border-slate-800 text-slate-600 hover:text-slate-300 border-l-0"
                      }`}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
              {importedFrameworks.map((fw) => {
                const active = fw.active !== false;
                return (
                  <div key={fw.framework_id} className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => toggleImportedFramework(fw.framework_id)}
                      className={`px-4 py-2.5 rounded-l-xl text-xs font-bold border border-r-0 transition-all ${
                        active
                          ? "bg-emerald-600/10 border-emerald-500/40 text-emerald-300 shadow-sm shadow-emerald-600/5"
                          : "bg-slate-900/30 border-slate-800 text-slate-500 hover:border-slate-700"
                      }`}
                    >
                      <div className="text-left">
                        <div>{fw.name}</div>
                        <div className="text-[8px] font-normal text-slate-500 mt-0.5">{fw.regulatory_reference}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setScopeInfoImported(fw); setScopeInfoFramework(null); }}
                      title="Inspect Scope"
                      className={`px-2 rounded-r-xl border text-xs font-bold transition-all ${
                        active
                          ? "bg-emerald-600/10 border-emerald-500/40 text-emerald-400 hover:text-emerald-200 border-l-0"
                          : "bg-slate-900/30 border-slate-800 text-slate-600 hover:text-slate-300 border-l-0"
                      }`}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeImportedFramework(fw.framework_id)}
                      title="Remove imported framework"
                      className="px-2 rounded-r-xl border border-l-0 bg-slate-900/30 border-slate-800 text-slate-600 hover:text-red-400 transition-all text-xs"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Standard Entity Grid */}
          <div className="rounded-2xl border border-slate-900 bg-slate-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Standard Entity Rules</h3>
                <HelpTooltip content="Each entity type can be toggled on/off and assigned an action: Mask (replace with placeholder), Tokenize (replace with contextual token like <EMAIL_1>), or Block (reject the turn entirely). Active framework presets auto-enforce certain entities." side="right" />
              </div>
              <button
                type="button"
                onClick={() => { setAddEntityModalOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800/50 text-slate-300 hover:text-white text-xs font-bold transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Standard Entity
              </button>
            </div>
            <p className="text-[10px] text-slate-500">Toggle entities and assign Mask / Tokenize / Block actions.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {entityRules.map((rule) => {
                const enforcingFrameworks = entityActiveFrameworks[rule.entity] || [];
                return (
                  <div
                    key={rule.entity}
                    className={`flex flex-col p-3 rounded-xl border transition-all ${
                      rule.enabled ? "border-slate-800 bg-slate-900/30" : "border-slate-900 bg-slate-950/10 opacity-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => toggleEntityEnabled(rule.entity)}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500/30 accent-indigo-500"
                        />
                        <span className="text-xs font-semibold text-slate-300">{rule.label}</span>
                      </div>
                      <select
                        value={rule.action}
                        onChange={(e) => updateEntityAction(rule.entity, e.target.value as ComplianceEntityRule["action"])}
                        disabled={!rule.enabled}
                        className="text-[10px] rounded-lg border border-slate-800 bg-[#0c0c16] py-1.5 px-2 text-white outline-none focus:border-indigo-500 disabled:opacity-40"
                      >
                        {ENTITY_ACTIONS.map((a) => (
                          <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                    </div>
                    {enforcingFrameworks.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2 ml-7">
                        {enforcingFrameworks.map((ef) => (
                          <span key={ef} className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            Enforced by {ef}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Sensitive Keywords */}
          <div className="rounded-2xl border border-slate-900 bg-slate-950/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Custom Sensitive Keywords</h3>
              <HelpTooltip content="Add proprietary business terms, project codenames, or internal identifiers. Each keyword can be assigned an action: Mask (replace with [KEYWORD_REDACTED]), Tokenize (replace with contextual token), or Block (reject the turn)." side="right" />
            </div>
            <p className="text-[10px] text-slate-500">Add proprietary business terms with per-keyword action strategies.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
                placeholder="e.g. Project_Cobalt"
                className="flex-1 rounded-lg border border-slate-800 bg-slate-900/50 py-2 px-3 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500 font-mono"
              />
              <select
                value={keywordAction}
                onChange={(e) => setKeywordAction(e.target.value as "mask" | "tokenize" | "block")}
                className="text-[10px] rounded-lg border border-slate-800 bg-[#0c0c16] py-2 px-2 text-white outline-none focus:border-indigo-500"
              >
                <option value="mask">Mask</option>
                <option value="tokenize">Tokenize</option>
                <option value="block">Block</option>
              </select>
              <button
                type="button"
                onClick={addKeyword}
                className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {customKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {customKeywords.map((kw) => (
                  <span key={kw.keyword} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-950/30 border border-amber-500/20 text-[10px] font-mono text-amber-300">
                    {kw.keyword}
                    <select
                      value={kw.action}
                      onChange={(e) => updateKeywordAction(kw.keyword, e.target.value as "mask" | "tokenize" | "block")}
                      className="ml-1 text-[8px] rounded border border-transparent bg-transparent text-amber-400 outline-none hover:border-amber-500/30 cursor-pointer"
                    >
                      <option value="mask">[Mask]</option>
                      <option value="tokenize">[Tokenize]</option>
                      <option value="block">[Block]</option>
                    </select>
                    <button type="button" onClick={() => removeKeyword(kw.keyword)} className="text-amber-500/60 hover:text-red-400 transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Custom Regex Rules */}
          <div className="rounded-2xl border border-slate-900 bg-slate-950/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Custom Regex Rules</h3>
              <HelpTooltip content="Define advanced regex patterns for specialized entity detection. Use presets for common patterns or the AI Generator to create patterns from sample input strings." side="right" />
            </div>
            <p className="text-[10px] text-slate-500">Optional advanced custom regex patterns for specialized entity detection.</p>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-slate-500 font-semibold shrink-0">Presets:</span>
              <div className="flex flex-wrap gap-1">
                {REGEX_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { setRegexLabel(p.label); setRegexPattern(p.pattern); }}
                    className="px-2 py-1 rounded-md bg-slate-900 border border-slate-800 text-[9px] text-slate-400 hover:text-white hover:border-slate-700 transition-all font-mono"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={regexLabel}
                onChange={(e) => setRegexLabel(e.target.value)}
                placeholder="Label (e.g. Medical Record #)"
                className="rounded-lg border border-slate-800 bg-slate-900/50 py-2 px-3 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
              />
              <input
                type="text"
                value={regexPattern}
                onChange={(e) => setRegexPattern(e.target.value)}
                placeholder="Pattern (e.g. \\bMRN-\\d{6}\\b)"
                className="rounded-lg border border-slate-800 bg-slate-900/50 py-2 px-3 text-xs text-white font-mono placeholder-slate-600 outline-none focus:border-indigo-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addRegex}
                  className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all"
                >
                  <Plus className="h-3.5 w-3.5 inline mr-1" /> Add Rule
                </button>
                <button
                  type="button"
                  onClick={() => { setAiRegexModalOpen(true); setAiRegexResult(null); setAiRegexError(null); setAiRegexSample(""); setAiRegexLabel(""); }}
                  title="Generate via AI"
                  className="px-3 py-2 rounded-lg border border-violet-500/30 bg-violet-600/10 hover:bg-violet-600/20 text-violet-400 hover:text-violet-300 text-xs font-bold transition-all"
                >
                  <WandSparkles className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {customRegex.length > 0 && (
              <div className="space-y-1.5">
                {customRegex.map((r, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/20 border border-slate-900">
                    <div>
                      <span className="text-xs font-semibold text-slate-300">{r.label}</span>
                      <span className="ml-2 text-[10px] font-mono text-slate-500">{r.pattern}</span>
                    </div>
                    <button type="button" onClick={() => removeRegex(idx)} className="text-slate-600 hover:text-red-400 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save */}
          <div className="sticky bottom-0 bg-slate-950 py-3 border-t border-slate-900">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/15 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save Compliance Configuration"}
            </button>
          </div>
        </div>
      )}

      {tab === "stream" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-indigo-400 animate-pulse" />
              <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">Live Masking Audit Stream</span>
              <HelpTooltip content="Displays real-time masking events as the compliance engine processes LLM prompts. Each entry shows the operation type, affected entities, and which framework triggered the rule." side="right" />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] text-slate-400 font-semibold uppercase">
                <input type="checkbox" checked={streamActive} onChange={(e) => setStreamActive(e.target.checked)} className="rounded border-slate-800 bg-slate-950 text-indigo-650 focus:ring-0 cursor-pointer" />
                Live Stream Logs
              </label>
              <button type="button" onClick={fetchLogs} disabled={loadingLogs} className="p-1.5 rounded-lg border border-slate-850 hover:border-slate-750 bg-slate-900/50 text-slate-400 hover:text-white transition-all shrink-0" title="Force log refresh">
                {loadingLogs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex-1 rounded-2xl border border-slate-900 bg-[#040408] p-4 font-mono text-[10px] text-slate-400 overflow-y-auto space-y-3 relative min-h-0 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-850">
            {auditLogs.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700 gap-2">
                <Activity className="h-6 w-6 text-slate-800 animate-pulse" />
                <span>No masking transactions captured yet...</span>
              </div>
            ) : (
              auditLogs.map((log, idx) => (
                <div key={idx} className="border-b border-slate-950/60 pb-2.5 last:border-0 hover:bg-slate-950/20 transition-all px-1.5 py-1 rounded">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-1 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 font-bold">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                        log.operation === "mask" ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}>
                        {log.operation === "mask" ? "INCOMING_PII_MASKED" : "OUTGOING_HYDRATED"}
                      </span>
                      {log.frameworkTriggered && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {log.frameworkTriggered}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-650 text-[9px] font-semibold">Fields: {log.totalMasked}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-3">
                    {log.categories.map((c, cIdx) => (
                      <span key={cIdx} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-850 text-slate-500 text-[9px]">
                        {c.label}: <strong className="text-indigo-400 font-bold font-mono">{c.count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* ── Scope Info Modal ── */}
      {(scopeInfoFramework !== null || scopeInfoImported !== null) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setScopeInfoFramework(null); setScopeInfoImported(null); }} />
          <div className="relative bg-[#0a0a14] border border-slate-800 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            <button
              type="button"
              onClick={() => { setScopeInfoFramework(null); setScopeInfoImported(null); }}
              className="absolute top-4 right-4 text-slate-600 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            {scopeInfoImported ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-8 w-8 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
                    <Eye className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{scopeInfoImported.name}</h3>
                    <p className="text-[10px] text-slate-500">{scopeInfoImported.description}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-900 bg-slate-950/30 p-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Regulatory Reference</span>
                    <p className="text-xs text-slate-300 mt-1 font-mono">{scopeInfoImported.regulatory_reference}</p>
                  </div>
                  <div className="rounded-xl border border-slate-900 bg-slate-950/30 p-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Covered Entities ({scopeInfoImported.entities.length})</span>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {scopeInfoImported.entities.map((ent) => (
                        <span key={ent.entity_key} className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-300">
                          {ent.label}
                          <span className="ml-1.5 text-[8px] uppercase text-slate-500">({ent.default_action})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-900 bg-slate-950/30 p-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Entity Patterns</span>
                    <div className="mt-2 space-y-1">
                      {scopeInfoImported.entities.filter(e => e.pattern).map((ent) => (
                        <div key={ent.entity_key} className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">{ent.label}:</span>
                          <code className="text-[9px] font-mono text-indigo-400 bg-slate-900/50 px-1.5 py-0.5 rounded">{ent.pattern}</code>
                        </div>
                      ))}
                      {scopeInfoImported.entities.filter(e => !e.pattern).length === scopeInfoImported.entities.length && (
                        <span className="text-[10px] text-slate-600 italic">No custom regex patterns defined — entity detection relies on label matching.</span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : scopeInfoFramework && FRAMEWORK_SCOPE[scopeInfoFramework] && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-8 w-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                    <ShieldCheck className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{FRAMEWORKS.find(f => f.key === scopeInfoFramework)?.label}</h3>
                    <p className="text-[10px] text-slate-500">{FRAMEWORKS.find(f => f.key === scopeInfoFramework)?.description}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-900 bg-slate-950/30 p-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Regulatory Reference</span>
                    <p className="text-xs text-slate-300 mt-1 font-mono">{FRAMEWORK_SCOPE[scopeInfoFramework].regulatoryReference}</p>
                  </div>
                  <div className="rounded-xl border border-slate-900 bg-slate-950/30 p-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Covered Entities ({FRAMEWORK_SCOPE[scopeInfoFramework].entities.length})</span>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {FRAMEWORK_SCOPE[scopeInfoFramework].entities.map((ent) => (
                        <span key={ent.key} className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-300">
                          {ent.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-900 bg-slate-950/30 p-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Enforcement Strategy</span>
                    <p className="text-xs text-slate-300 mt-1">{FRAMEWORK_SCOPE[scopeInfoFramework].enforcementStrategy}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Import Framework Modal ── */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setImportModalOpen(false); setImportError(null); setImportSuccess(null); }} />
          <div className="relative bg-[#0a0a14] border border-slate-800 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            <button
              type="button"
              onClick={() => { setImportModalOpen(false); setImportError(null); setImportSuccess(null); }}
              className="absolute top-4 right-4 text-slate-600 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-bold text-white">Import Custom Framework</h3>
              <HelpTooltip content="Upload a JSON or CSV file defining entity rules for a custom compliance framework. JSON expects a 'framework' object with name and entities array. CSV expects columns: Entity,Action,Pattern." side="right" />
            </div>
            <p className="text-[10px] text-slate-500 mb-4">Upload a <code className="text-indigo-400">.json</code> or <code className="text-indigo-400">.csv</code> file defining your custom compliance framework.</p>

            {/* Drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragOver
                  ? "border-indigo-500 bg-indigo-500/5"
                  : "border-slate-800 bg-slate-950/30 hover:border-slate-700"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Upload className="h-8 w-8 mx-auto mb-2 text-slate-600" />
              <p className="text-xs text-slate-400 font-semibold">Drag & drop your file here, or click to browse</p>
              <p className="text-[10px] text-slate-600 mt-1">Supported formats: .json, .csv</p>
            </div>

            {/* Sample template links */}
            <div className="flex items-center gap-3 mt-3 justify-center">
              <button type="button" onClick={downloadSampleJson} className="flex items-center gap-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors">
                <FileDown className="h-3 w-3" /> DPDP Act (JSON)
              </button>
              <span className="text-slate-700">|</span>
              <button type="button" onClick={downloadSampleCsv} className="flex items-center gap-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors">
                <FileSpreadsheet className="h-3 w-3" /> SOC 2 (CSV)
              </button>
            </div>

            {/* Required schema info */}
            <div className="mt-4 rounded-xl border border-slate-900 bg-slate-950/30 p-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Required Schema Fields</span>
              <div className="mt-2 space-y-1 text-[10px] font-mono">
                <div className="text-slate-400"><span className="text-indigo-400">framework_id</span> — Unique identifier</div>
                <div className="text-slate-400"><span className="text-indigo-400">name</span> — Display name</div>
                <div className="text-slate-400"><span className="text-indigo-400">regulatory_reference</span> — Governing standard</div>
                <div className="text-slate-400"><span className="text-indigo-400">description</span> — Brief description</div>
                <div className="text-slate-400"><span className="text-indigo-400">entities[]</span> — Array of entities with label, entity_key, default_action, and optional pattern</div>
              </div>
            </div>

            {importError && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-400">
                <XCircle className="h-4 w-4 shrink-0" /> {importError}
              </div>
            )}
            {importSuccess && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> {importSuccess}
              </div>
            )}

            <button
              type="button"
              onClick={() => { setImportModalOpen(false); setImportError(null); setImportSuccess(null); }}
              className="mt-4 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Add Standard Entity Modal ── */}
      {addEntityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAddEntityModalOpen(false)} />
          <div className="relative bg-[#0a0a14] border border-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <button
              type="button"
              onClick={() => setAddEntityModalOpen(false)}
              className="absolute top-4 right-4 text-slate-600 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-bold text-white">Add Standard Entity</h3>
              <HelpTooltip content="Define a new entity type with a unique key, default masking action, and optional regex pattern for automatic detection." side="right" />
            </div>
            <p className="text-[10px] text-slate-500 mb-4">Define a new entity type to include in the compliance masking rules.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Label</label>
                <input
                  type="text"
                  value={newEntityLabel}
                  onChange={(e) => setNewEntityLabel(e.target.value)}
                  placeholder="e.g. Passport Number"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2 px-3 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Entity Key</label>
                <input
                  type="text"
                  value={newEntityKey}
                  onChange={(e) => setNewEntityKey(e.target.value)}
                  placeholder="e.g. passport_num"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2 px-3 text-xs text-white font-mono placeholder-slate-600 outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Default Action</label>
                <select
                  value={newEntityAction}
                  onChange={(e) => setNewEntityAction(e.target.value as "mask" | "tokenize" | "block")}
                  className="w-full text-xs rounded-lg border border-slate-800 bg-[#0c0c16] py-2 px-3 text-white outline-none focus:border-indigo-500"
                >
                  <option value="mask">Mask — Replace with [ENTITY_REDACTED]</option>
                  <option value="tokenize">Tokenize — Replace with {'<ENTITY_N>'} token</option>
                  <option value="block">Block — Reject the turn entirely</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Optional Regex Pattern</label>
                <input
                  type="text"
                  value={newEntityPattern}
                  onChange={(e) => setNewEntityPattern(e.target.value)}
                  placeholder="e.g. \\bP[A-Z]\\d{8}\\b"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2 px-3 text-xs text-white font-mono placeholder-slate-600 outline-none focus:border-indigo-500"
                />
                <span className="text-[8px] text-slate-600 mt-1 block">If omitted, entity detection uses label-based matching only.</span>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setAddEntityModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddEntity}
                disabled={!newEntityLabel.trim() || !newEntityKey.trim() || entityRules.some((r) => r.entity === newEntityKey.trim())}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all disabled:opacity-50"
              >
                Add Entity
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Regex Generator Modal ── */}
      {aiRegexModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setAiRegexModalOpen(false); setAiRegexResult(null); setAiRegexError(null); }} />
          <div className="relative bg-[#0a0a14] border border-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <button
              type="button"
              onClick={() => { setAiRegexModalOpen(false); setAiRegexResult(null); setAiRegexError(null); }}
              className="absolute top-4 right-4 text-slate-600 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
                <WandSparkles className="h-4 w-4 text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">AI Regex Pattern Generator</h3>
                <p className="text-[10px] text-slate-500">Generate a regex pattern from a sample input string.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Sample Input String</label>
                <input
                  type="text"
                  value={aiRegexSample}
                  onChange={(e) => setAiRegexSample(e.target.value)}
                  placeholder="e.g. EMP-12345"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2 px-3 text-xs text-white font-mono placeholder-slate-600 outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Label (optional)</label>
                <input
                  type="text"
                  value={aiRegexLabel}
                  onChange={(e) => setAiRegexLabel(e.target.value)}
                  placeholder="e.g. Employee ID Pattern"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900/50 py-2 px-3 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={handleGenerateRegex}
                disabled={!aiRegexSample.trim() || aiRegexGenerating}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
              >
                {aiRegexGenerating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="h-4 w-4" /> Generate Pattern</>
                )}
              </button>

              {aiRegexError && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-400">
                  <XCircle className="h-4 w-4 shrink-0" /> {aiRegexError}
                </div>
              )}

              {aiRegexResult && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-400 uppercase">Generated Pattern</span>
                  </div>
                  <code className="block text-xs font-mono text-emerald-300 bg-slate-900/50 px-2 py-1.5 rounded-lg border border-slate-800 break-all">
                    {aiRegexResult.pattern}
                  </code>
                  {aiRegexResult.explanation && (
                    <p className="text-[10px] text-slate-400 italic">{aiRegexResult.explanation}</p>
                  )}
                  <button
                    type="button"
                    onClick={applyAiRegex}
                    className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <Braces className="h-3.5 w-3.5" /> Use This Pattern
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
