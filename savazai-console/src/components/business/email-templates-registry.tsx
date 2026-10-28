"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Mail,
  Send,
  Plus,
  Trash2,
  Edit,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  Search,
  Code,
  FileText,
  X,
  Copy,
  Check,
  Tag,
  AlertTriangle,
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Minus,
  ExternalLink,
  AlertCircle,
  Layers,
  Sparkles,
  Building2,
  Bot,
} from "lucide-react";
import { usePermissions } from "@/lib/auth/use-permissions";
import { HelpTooltip } from "@/components/shared/help-tooltip";
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

export interface EmailTemplate {
  id: string;
  templateKey: string;
  name: string;
  category: string;
  description: string | null;
  subject: string;
  bodyHtml: string;
  bodyMarkdown: string | null;
  supportedVariables: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MergeTagItem {
  tag: string;
  label: string;
  sample: string;
  group: "agentflow" | "organization";
}

const MERGE_TAGS: MergeTagItem[] = [
  // Agentflow State Variables
  { tag: "{{agent_name}}", label: "Agent Name", sample: "Supervisor Orchestrator", group: "agentflow" },
  { tag: "{{agentflow_title}}", label: "Agentflow Title", sample: "Customer Onboarding Agentflow", group: "agentflow" },
  { tag: "{{step_name}}", label: "Step Name", sample: "Compliance Verification", group: "agentflow" },
  { tag: "{{approver_email}}", label: "Approver Email", sample: "operator@enterprise.com", group: "agentflow" },
  { tag: "{{review_link}}", label: "Review Link", sample: "http://localhost:3056/dashboard", group: "agentflow" },
  { tag: "{{execution_id}}", label: "Execution ID", sample: "exec_9872a1", group: "agentflow" },
  { tag: "{{status}}", label: "Status", sample: "PENDING_APPROVAL", group: "agentflow" },
  { tag: "{{timestamp}}", label: "Timestamp", sample: new Date().toUTCString(), group: "agentflow" },

  // Organization Identity Variables
  { tag: "{{company_name}}", label: "Company Name", sample: "SavazAI Enterprise", group: "organization" },
  { tag: "{{company_email}}", label: "Company Email", sample: "security@savazar.com", group: "organization" },
  { tag: "{{company_phone}}", label: "Company Phone", sample: "+1 (800) 555-0199", group: "organization" },
  { tag: "{{company_address}}", label: "Company Address", sample: "100 Enterprise Way, Suite 400, Austin, TX 78701", group: "organization" },
  { tag: "{{company_website}}", label: "Company Website", sample: "https://savazar.com", group: "organization" },
  { tag: "{{support_email}}", label: "Support Email", sample: "support@savazar.com", group: "organization" },
];

const PRESET_CATEGORIES: { id: string; label: string; badge: string }[] = [
  { id: "approval", label: "Approval Request", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  { id: "agentflow_result", label: "Agentflow Dispatch Result", badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  { id: "system_alert", label: "Human-in-the-Loop Escalation", badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  { id: "notification", label: "System Notification", badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" },
];

export function EmailTemplatesRegistry() {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("business_center", "skills_edit") || hasPermission("command_center", "system_admin_manage");

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Modal states
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isAuthorModalOpen, setIsAuthorModalOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<EmailTemplate | null>(null);
  const [testModalTemplate, setTestModalTemplate] = useState<EmailTemplate | null>(null);

  // Form states
  const [formKey, setFormKey] = useState("");
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<string>("approval");
  const [isCustomCategoryActive, setIsCustomCategoryActive] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formBodyHtml, setFormBodyHtml] = useState("");
  const [formBodyMarkdown, setFormBodyMarkdown] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formSaving, setFormSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<"editor" | "split" | "preview">("split");
  const [editorViewType, setEditorViewType] = useState<"visual" | "html">("visual");
  const [lastFocusedField, setLastFocusedField] = useState<"subject" | "body">("body");

  // Test dispatch state
  const [testRecipient, setTestRecipient] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const subjectInputRef = useRef<HTMLInputElement>(null);
  const wysiwygEditorRef = useRef<HTMLDivElement>(null);
  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/email-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error("Failed to fetch email templates:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Sync visual contentEditable with formBodyHtml when opening modal or switching view
  useEffect(() => {
    if (isAuthorModalOpen && wysiwygEditorRef.current && editorViewType === "visual") {
      if (wysiwygEditorRef.current.innerHTML !== formBodyHtml) {
        wysiwygEditorRef.current.innerHTML = formBodyHtml;
      }
    }
  }, [isAuthorModalOpen, editorViewType, formBodyHtml]);

  // Discover all distinct categories
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    PRESET_CATEGORIES.forEach((c) => set.add(c.id));
    templates.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    return Array.from(set);
  }, [templates]);

  const getCategoryConfig = useCallback((cat: string) => {
    const found = PRESET_CATEGORIES.find((p) => p.id === cat);
    if (found) return found;
    // Format custom category
    const clean = cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      id: cat,
      label: clean,
      badge: "bg-primary/10 text-primary border-primary/20",
    };
  }, []);

  const openCreateModal = () => {
    setEditingTemplate(null);
    setFormKey("");
    setFormName("");
    setFormCategory("approval");
    setIsCustomCategoryActive(false);
    setCustomCategoryInput("");
    setFormDescription("");
    setFormSubject("[Action Required] Approval Needed for Agentflow {{agentflow_title}} - {{execution_id}}");
    const initialHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
  <div style="margin-bottom: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
    <h2 style="color: #0f172a; margin: 0 0 4px 0; font-size: 20px;">Execution Plan Approval Request</h2>
    <p style="color: #64748b; margin: 0; font-size: 13px;">Agentflow: <strong>{{agentflow_title}}</strong></p>
  </div>
  <p style="color: #334155; font-size: 14px; line-height: 1.6;">Supervisor agent <strong>{{agent_name}}</strong> has paused at step <code>{{step_name}}</code> for Agentflow <strong>{{agentflow_title}}</strong> awaiting your operational authorization.</p>
  <div style="background: #f8fafc; border-left: 4px solid #4f46e5; padding: 12px 16px; margin: 16px 0; border-radius: 4px; color: #334155; font-size: 13px;">
    <strong>Notice:</strong> Please verify the execution plan parameters and connected tool integrations before approving.
  </div>
  <div style="text-align: center; margin: 24px 0;">
    <a href="{{review_link}}" style="background: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Review &amp; Authorize Plan</a>
  </div>
  <p style="color: #94a3b8; font-size: 12px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 16px;">{{company_name}} &bull; {{platform_title}} Orchestration Engine</p>
</div>`;
    setFormBodyHtml(initialHtml);
    setFormBodyMarkdown("## Execution Plan Approval Request\n\nSupervisor agent **{{agent_name}}** paused on step **{{step_name}}**.");
    setFormActive(true);
    setPreviewMode("split");
    setEditorViewType("visual");
    setIsAuthorModalOpen(true);
  };

  const openEditModal = (t: EmailTemplate) => {
    setEditingTemplate(t);
    setFormKey(t.templateKey);
    setFormName(t.name);
    setFormCategory(t.category);
    setIsCustomCategoryActive(false);
    setCustomCategoryInput("");
    setFormDescription(t.description || "");
    setFormSubject(t.subject);
    setFormBodyHtml(t.bodyHtml);
    setFormBodyMarkdown(t.bodyMarkdown || "");
    setFormActive(t.isActive);
    setPreviewMode("split");
    setEditorViewType("visual");
    setIsAuthorModalOpen(true);
  };

  // Visual Editor Command Executer
  const execFormat = (cmd: string, val: string | undefined = undefined) => {
    if (editorViewType !== "visual") return;
    document.execCommand(cmd, false, val);
    if (wysiwygEditorRef.current) {
      setFormBodyHtml(wysiwygEditorRef.current.innerHTML);
    }
  };

  // Visual Block Inserters
  const insertHtmlSnippet = (snippet: string) => {
    if (editorViewType === "visual" && wysiwygEditorRef.current) {
      wysiwygEditorRef.current.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const el = document.createElement("div");
        el.innerHTML = snippet;
        const frag = document.createDocumentFragment();
        let node;
        let lastNode;
        while ((node = el.firstChild)) {
          lastNode = frag.appendChild(node);
        }
        range.insertNode(frag);
        if (lastNode) {
          range.setStartAfter(lastNode);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } else {
        wysiwygEditorRef.current.innerHTML += snippet;
      }
      setFormBodyHtml(wysiwygEditorRef.current.innerHTML);
    } else {
      setFormBodyHtml((prev) => prev + "\n" + snippet);
    }
  };

  const handleInsertTag = (tag: string) => {
    if (lastFocusedField === "subject") {
      setFormSubject((prev) => prev + " " + tag);
    } else {
      insertHtmlSnippet(`<span style="background: #eef2ff; color: #4f46e5; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 12px; border: 1px solid #c7d2fe;">${tag}</span> `);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveCategory = isCustomCategoryActive && customCategoryInput.trim()
      ? customCategoryInput.trim().toLowerCase().replace(/\s+/g, "_")
      : formCategory;

    if (!formKey.trim() || !formName.trim() || !formSubject.trim() || !formBodyHtml.trim()) return;

    setFormSaving(true);
    try {
      const payload = {
        id: editingTemplate ? editingTemplate.id : undefined,
        templateKey: formKey.trim(),
        name: formName.trim(),
        category: effectiveCategory,
        description: formDescription.trim(),
        subject: formSubject.trim(),
        bodyHtml: formBodyHtml,
        bodyMarkdown: formBodyMarkdown,
        supportedVariables: MERGE_TAGS.map((m) => m.tag.replace(/[{}]/g, "")),
        isActive: formActive,
      };

      const res = await fetch("/api/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsAuthorModalOpen(false);
        fetchTemplates();
      }
    } catch (err) {
      console.error("Failed to save email template:", err);
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/email-templates?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeletingTemplate(null);
        fetchTemplates();
      }
    } catch (err) {
      console.error("Failed to delete email template:", err);
    }
  };

  const handleDispatchTest = async () => {
    if (!testRecipient.trim()) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/email-templates/test-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateKey: testModalTemplate?.templateKey,
          recipientEmail: testRecipient.trim(),
          subject: testModalTemplate?.subject,
          bodyHtml: testModalTemplate?.bodyHtml,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: `Email dispatched successfully to ${testRecipient}! Message ID: ${data.messageId || "ok"}`,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || "Delivery failed. Verify SMTP settings in System Admin.",
        });
      }
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Network failure during test email dispatch.",
      });
    } finally {
      setTestSending(false);
    }
  };

  // Filtered list
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchesSearch =
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.templateKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.subject.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === "all" || t.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [templates, searchQuery, categoryFilter]);

  // Mock substitute for live preview
  const livePreviewData = useMemo(() => {
    let sub = formSubject;
    let html = formBodyHtml;
    // Replace backward-compatible tags
    sub = sub.replaceAll("{{workflow_title}}", "Customer Onboarding Agentflow");
    html = html.replaceAll("{{workflow_title}}", "Customer Onboarding Agentflow");

    for (const item of MERGE_TAGS) {
      sub = sub.replaceAll(item.tag, item.sample);
      html = html.replaceAll(item.tag, item.sample);
    }
    return { subject: sub, html };
  }, [formSubject, formBodyHtml]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground">
      {/* Catalog Top Header */}
      <div className="p-5 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-foreground tracking-tight">Email Message Templates Engine</h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {templates.length} registered
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rich message blueprints with system merge variables for Human-in-the-Loop approval requests, incident alerts, and Agentflow reports
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={openCreateModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs cursor-pointer transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>Create Message Template</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by template name, slug key, or subject line..."
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary cursor-pointer shadow-xs"
          >
            <option value="all">All Categories</option>
            {allCategories.map((catKey) => {
              const cfg = getCategoryConfig(catKey);
              return (
                <option key={catKey} value={catKey}>
                  {cfg.label}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Registry Table / Grid */}
      <div className="flex-1 overflow-y-auto p-5 min-h-0">
        {loading ? (
          <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs">Loading email message templates...</span>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border rounded-2xl bg-card p-6 text-center">
            <Mail className="h-8 w-8 text-muted-foreground/60 mb-2" />
            <p className="text-xs font-semibold text-foreground">No email message templates found</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Click &quot;Create Message Template&quot; to author your first transactional message blueprint.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {filteredTemplates.map((template) => {
              const catConfig = getCategoryConfig(template.category);
              return (
                <div
                  key={template.id}
                  className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-all shadow-xs flex flex-col justify-between gap-3 group"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground">{template.name}</span>
                        <code className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-muted text-foreground border border-border">
                          {template.templateKey}
                        </code>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${catConfig.badge}`}>
                          {catConfig.label}
                        </span>
                        {!template.isActive && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            Disabled
                          </span>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{template.description}</p>
                      )}
                      <div className="pt-1 flex items-center gap-1.5 text-xs text-foreground font-medium">
                        <span className="text-muted-foreground text-[11px] uppercase tracking-wider font-semibold">Subject:</span>
                        <span className="font-mono text-[11.5px] truncate max-w-xl">{template.subject}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end md:self-start">
                      <button
                        type="button"
                        onClick={() => {
                          setTestModalTemplate(template);
                          setTestRecipient("");
                          setTestResult(null);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-foreground transition-all cursor-pointer shadow-xs"
                        title="Send test message via SMTP"
                      >
                        <Send className="h-3.5 w-3.5 text-primary" />
                        <span>Test Send</span>
                      </button>

                      {canEdit && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(template)}
                            className="p-1.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-xs"
                            title="Edit template"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeletingTemplate(template)}
                            className="p-1.5 rounded-xl border border-border hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all cursor-pointer shadow-xs"
                            title="Delete template"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Variables pills */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-border/60 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Merge Tags:</span>
                    {(template.supportedVariables || []).slice(0, 8).map((varKey) => (
                      <span
                        key={varKey}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/50"
                      >
                        &#123;&#123;{varKey}&#125;&#125;
                      </span>
                    ))}
                    {(template.supportedVariables || []).length > 8 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{(template.supportedVariables || []).length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── AUTHOR / EDIT WYSIWYG MODAL ── */}
      {isAuthorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-5xl rounded-3xl border border-border bg-card text-card-foreground shadow-2xl flex flex-col max-h-[94vh] overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0 bg-card">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {editingTemplate ? "Edit Email Message Template" : "Create Email Message Template"}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    WYSIWYG visual message authoring, dynamic categories, and system merge variables
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-xl border border-border bg-muted p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("editor")}
                    className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                      previewMode === "editor" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("split")}
                    className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                      previewMode === "split" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Split View
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("preview")}
                    className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                      previewMode === "preview" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Live Preview
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAuthorModalOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Meta Inputs: Name, Key, Category */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Plan Approval Request"
                    className="w-full rounded-xl border border-border bg-background py-2 px-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Template Slug Key (Unique) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formKey}
                    onChange={(e) => setFormKey(e.target.value)}
                    placeholder="e.g. hitl_plan_approval"
                    className="w-full rounded-xl border border-border bg-background py-2 px-3 text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Category *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomCategoryActive(!isCustomCategoryActive)}
                      className="text-[10px] text-primary hover:underline font-semibold"
                    >
                      {isCustomCategoryActive ? "Select Existing" : "+ New Category"}
                    </button>
                  </div>
                  {isCustomCategoryActive ? (
                    <input
                      type="text"
                      required
                      value={customCategoryInput}
                      onChange={(e) => setCustomCategoryInput(e.target.value)}
                      placeholder="e.g. Invoicing Alert"
                      className="w-full rounded-xl border border-primary/50 bg-background py-2 px-3 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/20"
                      autoFocus
                    />
                  ) : (
                    <select
                      value={formCategory}
                      onChange={(e) => {
                        if (e.target.value === "__NEW__") {
                          setIsCustomCategoryActive(true);
                          setCustomCategoryInput("");
                        } else {
                          setFormCategory(e.target.value);
                        }
                      }}
                      className="w-full rounded-xl border border-border bg-background py-2 px-3 text-xs text-foreground outline-none focus:border-primary cursor-pointer"
                    >
                      {allCategories.map((cKey) => {
                        const cfg = getCategoryConfig(cKey);
                        return (
                          <option key={cKey} value={cKey}>
                            {cfg.label}
                          </option>
                        );
                      })}
                      <option value="__NEW__">+ Add Custom Category...</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Subject Line */}
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Email Subject Line (Supports Merge Tags) *
                </label>
                <input
                  ref={subjectInputRef}
                  type="text"
                  required
                  value={formSubject}
                  onFocus={() => setLastFocusedField("subject")}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="e.g. [Action Required] Approval Needed for Agentflow {{agentflow_title}} - {{execution_id}}"
                  className="w-full rounded-xl border border-border bg-background py-2.5 px-3.5 text-xs text-foreground font-mono placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                />
              </div>

              {/* Merge Variables Pill Bar */}
              <div className="rounded-2xl border border-border bg-muted/20 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-primary" />
                    Available System Merge Tags (Click to insert at active position)
                  </span>
                </div>

                <div className="space-y-2">
                  {/* Agentflow State Group */}
                  <div>
                    <span className="text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1.5">
                      <Bot className="h-3 w-3 text-primary" /> Agentflow State:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {MERGE_TAGS.filter((m) => m.group === "agentflow").map((item) => (
                        <button
                          key={item.tag}
                          type="button"
                          onClick={() => handleInsertTag(item.tag)}
                          className="px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-primary/10 hover:border-primary/40 text-[11px] font-mono text-foreground cursor-pointer transition-all shadow-xs flex items-center gap-1"
                          title={`Insert ${item.tag} (Sample: ${item.sample})`}
                        >
                          <span className="text-primary font-bold">+</span>
                          <span>{item.tag}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Organization Identity Group */}
                  <div>
                    <span className="text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1.5">
                      <Building2 className="h-3 w-3 text-primary" /> Organization Metadata:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {MERGE_TAGS.filter((m) => m.group === "organization").map((item) => (
                        <button
                          key={item.tag}
                          type="button"
                          onClick={() => handleInsertTag(item.tag)}
                          className="px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-primary/10 hover:border-primary/40 text-[11px] font-mono text-foreground cursor-pointer transition-all shadow-xs flex items-center gap-1"
                          title={`Insert ${item.tag} (Sample: ${item.sample})`}
                        >
                          <span className="text-primary font-bold">+</span>
                          <span>{item.tag}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Dual-Mode Body Editor & Split Live Preview */}
              <div className={`grid gap-4 ${previewMode === "split" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
                {/* Editor Pane */}
                {previewMode !== "preview" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Email Message Body *
                        </label>
                        <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-[10px]">
                          <button
                            type="button"
                            onClick={() => setEditorViewType("visual")}
                            className={`px-2 py-0.5 rounded font-semibold transition-all ${
                              editorViewType === "visual" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Visual WYSIWYG
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditorViewType("html")}
                            className={`px-2 py-0.5 rounded font-semibold transition-all ${
                              editorViewType === "html" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            HTML Code
                          </button>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">{formBodyHtml.length} characters</span>
                    </div>

                    {/* WYSIWYG Formatting Toolbar */}
                    {editorViewType === "visual" && (
                      <div className="flex flex-wrap items-center gap-1 p-2 rounded-xl border border-border bg-muted/40 text-xs">
                        {/* Heading formats */}
                        <button
                          type="button"
                          onClick={() => execFormat("formatBlock", "<h2>")}
                          className="px-2 py-1 rounded hover:bg-muted text-foreground font-bold text-[11px] border border-border/40 bg-card"
                          title="Heading 2"
                        >
                          H2
                        </button>
                        <button
                          type="button"
                          onClick={() => execFormat("formatBlock", "<h3>")}
                          className="px-2 py-1 rounded hover:bg-muted text-foreground font-bold text-[11px] border border-border/40 bg-card"
                          title="Heading 3"
                        >
                          H3
                        </button>
                        <button
                          type="button"
                          onClick={() => execFormat("formatBlock", "<p>")}
                          className="px-2 py-1 rounded hover:bg-muted text-foreground font-semibold text-[11px] border border-border/40 bg-card"
                          title="Paragraph"
                        >
                          P
                        </button>

                        <div className="h-4 w-px bg-border mx-1" />

                        {/* Inline styles */}
                        <button
                          type="button"
                          onClick={() => execFormat("bold")}
                          className="p-1.5 rounded hover:bg-muted text-foreground border border-border/40 bg-card"
                          title="Bold"
                        >
                          <Bold className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => execFormat("italic")}
                          className="p-1.5 rounded hover:bg-muted text-foreground border border-border/40 bg-card"
                          title="Italic"
                        >
                          <Italic className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => execFormat("strikeThrough")}
                          className="p-1.5 rounded hover:bg-muted text-foreground border border-border/40 bg-card"
                          title="Strikethrough"
                        >
                          <Strikethrough className="h-3.5 w-3.5" />
                        </button>

                        <div className="h-4 w-px bg-border mx-1" />

                        {/* Lists */}
                        <button
                          type="button"
                          onClick={() => execFormat("insertUnorderedList")}
                          className="p-1.5 rounded hover:bg-muted text-foreground border border-border/40 bg-card"
                          title="Bullet List"
                        >
                          <List className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => execFormat("insertOrderedList")}
                          className="p-1.5 rounded hover:bg-muted text-foreground border border-border/40 bg-card"
                          title="Numbered List"
                        >
                          <ListOrdered className="h-3.5 w-3.5" />
                        </button>

                        <div className="h-4 w-px bg-border mx-1" />

                        {/* Alignment */}
                        <button
                          type="button"
                          onClick={() => execFormat("justifyLeft")}
                          className="p-1.5 rounded hover:bg-muted text-foreground border border-border/40 bg-card"
                          title="Align Left"
                        >
                          <AlignLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => execFormat("justifyCenter")}
                          className="p-1.5 rounded hover:bg-muted text-foreground border border-border/40 bg-card"
                          title="Align Center"
                        >
                          <AlignCenter className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => execFormat("justifyRight")}
                          className="p-1.5 rounded hover:bg-muted text-foreground border border-border/40 bg-card"
                          title="Align Right"
                        >
                          <AlignRight className="h-3.5 w-3.5" />
                        </button>

                        <div className="h-4 w-px bg-border mx-1" />

                        {/* Smart Elements */}
                        <button
                          type="button"
                          onClick={() => insertHtmlSnippet(`<div style="background: #f8fafc; border-left: 4px solid #4f46e5; padding: 12px 16px; margin: 16px 0; border-radius: 4px; color: #334155; font-size: 13px;"><strong>Notice:</strong> Operational directive message goes here.</div>`)}
                          className="px-2 py-1 rounded hover:bg-muted text-foreground text-[10px] font-semibold flex items-center gap-1 border border-border/40 bg-card"
                          title="Insert Callout Card"
                        >
                          <AlertCircle className="h-3 w-3 text-primary" />
                          <span>Callout</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => insertHtmlSnippet(`<div style="text-align: center; margin: 20px 0;"><a href="{{review_link}}" style="background: #4f46e5; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; display: inline-block;">Action Button</a></div>`)}
                          className="px-2 py-1 rounded hover:bg-muted text-foreground text-[10px] font-semibold flex items-center gap-1 border border-border/40 bg-card"
                          title="Insert CTA Action Button"
                        >
                          <ExternalLink className="h-3 w-3 text-primary" />
                          <span>CTA Button</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => insertHtmlSnippet(`<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />`)}
                          className="p-1.5 rounded hover:bg-muted text-foreground border border-border/40 bg-card"
                          title="Insert Horizontal Divider"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Visual Rich Contenteditable Canvas */}
                    {editorViewType === "visual" ? (
                      <div
                        ref={wysiwygEditorRef}
                        contentEditable
                        onFocus={() => setLastFocusedField("body")}
                        onInput={(e) => setFormBodyHtml(e.currentTarget.innerHTML)}
                        className="w-full min-h-[320px] max-h-[440px] overflow-y-auto rounded-2xl border border-border bg-white text-slate-900 p-5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 leading-relaxed shadow-inner"
                      />
                    ) : (
                      <textarea
                        ref={htmlTextareaRef}
                        required
                        rows={14}
                        value={formBodyHtml}
                        onFocus={() => setLastFocusedField("body")}
                        onChange={(e) => setFormBodyHtml(e.target.value)}
                        placeholder="<div style='...'>Your HTML email body with {{merge_tags}}</div>"
                        className="w-full rounded-2xl border border-border bg-background p-3.5 text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-y leading-relaxed"
                      />
                    )}
                  </div>
                )}

                {/* Live Preview Pane */}
                {previewMode !== "editor" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5 text-primary" />
                        Live Split Preview (Mock Data Substituted)
                      </label>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Interactive Render
                      </span>
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 min-h-[300px] max-h-[500px] overflow-y-auto">
                      {/* Email Client Mock Frame */}
                      <div className="border border-border/80 rounded-xl bg-muted/40 p-3 space-y-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-[10px] font-bold uppercase w-12">From:</span>
                          <span className="text-foreground font-medium">SavazAI Platform &lt;security@savazar.com&gt;</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-[10px] font-bold uppercase w-12">Subject:</span>
                          <span className="text-foreground font-bold">{livePreviewData.subject}</span>
                        </div>
                      </div>

                      {/* Rendered HTML Box */}
                      <div className="border border-border rounded-xl p-4 bg-white text-slate-900 overflow-x-auto shadow-sm">
                        <div
                          dangerouslySetInnerHTML={{ __html: livePreviewData.html }}
                          className="prose prose-sm max-w-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Active Toggle & Footer Actions */}
              <div className="pt-3 border-t border-border flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  <span>Active template available for Agentflow triggers</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAuthorModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formSaving}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50 transition-all"
                  >
                    {formSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>{editingTemplate ? "Save Changes" : "Create Template"}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── TEST DISPATCH MODAL ── */}
      {testModalTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-primary">
                <Send className="h-5 w-5" />
                <h3 className="text-base font-bold text-foreground">Dispatch Test Email</h3>
              </div>
              <button
                type="button"
                onClick={() => setTestModalTemplate(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Dispatch a live transactional test for <strong>{testModalTemplate.name}</strong> (<code>{testModalTemplate.templateKey}</code>) using the active SMTP relay.
            </p>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Recipient Email Address *
              </label>
              <input
                type="email"
                required
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="operator@example.com"
                className="w-full rounded-xl border border-border bg-background py-2.5 px-3.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs leading-relaxed flex items-start gap-2 ${
                  testResult.success
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : "bg-destructive/10 border-destructive/20 text-destructive"
                }`}
              >
                {testResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                <span>{testResult.message}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setTestModalTemplate(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleDispatchTest}
                disabled={testSending || !testRecipient.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {testSending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Send Test Email</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE MODAL ── */}
      {deletingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-base font-bold text-foreground">Delete Email Template</h3>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to permanently delete template <strong className="text-foreground">{deletingTemplate.name}</strong> (<code>{deletingTemplate.templateKey}</code>)? Any Agentflow referencing this key will revert to system default notifications.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setDeletingTemplate(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deletingTemplate.id)}
                className="px-4 py-2 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-semibold cursor-pointer"
              >
                Confirm Deletion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
