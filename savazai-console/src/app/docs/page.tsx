"use client";

import React, { useState, useMemo } from "react";
import {
  BookOpen,
  Search,
  Bot,
  BrainCircuit,
  Library,
  Settings,
  Users,
  ShieldCheck,
  Zap,
  Lock,
  Workflow,
  Cpu,
  Database,
  Key,
  ChevronRight,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  FileText,
  UploadCloud,
  Check,
  UserCheck,
  ShieldAlert,
  ArrowRight,
  Compass,
  FileCode2,
  Clock,
  Eye,
  Plus
} from "lucide-react";

interface StepItem {
  step: number;
  title: string;
  description: string;
}

interface HighlightItem {
  label: string;
  description: string;
}

interface DocSection {
  id: string;
  title: string;
  badge?: "User Guide" | "Admin Only" | "Safety Rule" | "How-To Guide" | "Overview";
  summary: string;
  highlights?: HighlightItem[];
  steps?: StepItem[];
  callout?: {
    type: "tip" | "important" | "admin";
    title: string;
    message: string;
  };
  table?: {
    headers: string[];
    rows: string[][];
  };
}

interface DocModule {
  id: string;
  title: string;
  shortTitle: string;
  icon: React.ElementType;
  description: string;
  sections: DocSection[];
}

const DOCS_MODULES: DocModule[] = [
  {
    id: "getting-started",
    title: "Module 1: Getting Started & SavazAI Overview",
    shortTitle: "1. Overview & Setup",
    icon: Compass,
    description: "Welcome to SavazAI. Learn the fundamentals of our enterprise agentic AI platform, how to navigate the console, and how user roles function.",
    sections: [
      {
        id: "what-is-savazai",
        title: "What is SavazAI?",
        badge: "Overview",
        summary: "SavazAI is a sovereign, enterprise-grade multi-agent operating system designed to orchestrate autonomous AI workflows with total reliability and governance. Instead of simple chatbot responses, SavazAI coordinates specialized agents that can analyze data, execute tools, reference your company knowledge base, and carry out multi-step business procedures with human oversight.",
        highlights: [
          {
            label: "Deterministic Multi-Agent Coordination",
            description: "Agents collaborate in structured teams: Supervisor agents formulate plans, Specialist workers execute designated tasks, and Synthesizers summarize results into executive reports."
          },
          {
            label: "Enterprise Knowledge Grounding",
            description: "Agents reference your verified organizational documentation (OKF) to ensure every response aligns strictly with corporate policies and domain truth."
          },
          {
            label: "Total Privacy & Data Protection",
            description: "Built-in privacy gateways automatically sanitize and mask sensitive personal or financial information before communicating with external AI providers."
          }
        ],
        callout: {
          type: "tip",
          title: "Pro Tip for Business Operators",
          message: "SavazAI adapts dynamically to any business domain. You do not need technical programming skills to create automated workflows, ingest documentation, or personalize your workspace."
        }
      },
      {
        id: "navigating-console",
        title: "Navigating the SavazAI Console",
        badge: "User Guide",
        summary: "The SavazAI Console is organized into dedicated functional centers accessible via the persistent global sidebar on the left side of your screen.",
        highlights: [
          {
            label: "Agent Workspace (/dashboard)",
            description: "The primary interactive environment where you chat with multi-agent teams, inspect live reasoning, and track execution metrics in real-time."
          },
          {
            label: "Capability Studio (/studio)",
            description: "The visual workflow studio where you explore agent skills, customize tools, and design drag-and-drop agent flow diagrams."
          },
          {
            label: "Business Center (/business)",
            description: "The organizational knowledge hub where you upload company documents, manage corporate policy rules, and review compliance logs."
          },
          {
            label: "Documentation Hub (/docs)",
            description: "This comprehensive user manual with step-by-step guides, operational procedures, and permissions reference."
          },
          {
            label: "Command Center (/admin/settings)",
            description: "Platform settings for prompt font sizing, interface themes, sidebar toggles, and encrypted AI provider connections."
          },
          {
            label: "User Admin (/admin/users)",
            description: "Administrative area for provisioning new team accounts, modifying roles, and managing security credentials (Restricted to Administrators)."
          }
        ]
      },
      {
        id: "understanding-roles",
        title: "Understanding User Roles & Access Permissions",
        badge: "Safety Rule",
        summary: "SavazAI implements a clear two-tier permission model designed to keep platform administration secure while empowering team members to leverage autonomous AI capabilities freely.",
        highlights: [
          {
            label: "Standard User Role",
            description: "Team members with User status have full access to chat with agents, create conversation threads, build and test agent workflows in Capability Studio, upload business documents in Business Center, and customize their personal prompt typography."
          },
          {
            label: "Administrator Role",
            description: "Platform Administrators hold elevated privileges. In addition to all standard user capabilities, admins configure encrypted AI provider API keys, manage corporate branding tokens, and provision or manage team accounts in the User Admin center."
          }
        ],
        callout: {
          type: "important",
          title: "Access Boundary Notice",
          message: "Standard users who attempt to access administrative URLs directly are safely redirected or presented with an access restriction notice. Your company's AI keys and credential vaults remain strictly protected."
        }
      }
    ]
  },
  {
    id: "agent-workspace",
    title: "Module 2: Agent Workspace (Live AI Operations)",
    shortTitle: "2. Agent Workspace",
    icon: Bot,
    description: "Learn how to interact with multi-agent teams, manage conversation sessions, inspect the execution timeline, and personalize your chat interface.",
    sections: [
      {
        id: "live-interaction",
        title: "Live Interaction & Multi-Agent Collaboration",
        badge: "User Guide",
        summary: "The Agent Workspace provides an interactive chat playground where multi-agent teams execute tasks collaboratively.",
        steps: [
          {
            step: 1,
            title: "Navigate to Agent Workspace",
            description: "Click 'Agent Workspace' in the left sidebar or visit /dashboard."
          },
          {
            step: 2,
            title: "Compose Your Business Request",
            description: "Type your query, analytical task, or automation prompt in the bottom input bar."
          },
          {
            step: 3,
            title: "Review Streaming Multi-Agent Execution",
            description: "Watch as the Supervisor formulates an execution strategy, specialist workers activate tools, and the Synthesizer generates your final structured response."
          }
        ],
        callout: {
          type: "tip",
          title: "Plan-First vs Autonomous Execution",
          message: "When 'Plan First' mode is active, the agent will present an execution plan card for your approval before taking any actions. You can click 'Approve & Execute', 'Adjust & Re-Plan' with new instructions, or 'Reject & Re-Plan'."
        }
      },
      {
        id: "conversation-threads",
        title: "Managing Conversation Threads & History",
        badge: "User Guide",
        summary: "SavazAI automatically organizes your work into distinct, persistent conversation threads so you can switch between tasks without losing context.",
        steps: [
          {
            step: 1,
            title: "Start a New Chat Session",
            description: "Click the '+' button next to 'Chat Conversations' in the sidebar to open a clean workspace."
          },
          {
            step: 2,
            title: "Switch Between Past Threads",
            description: "Click on any past conversation title in the sidebar list to instantly restore that session's chat history and execution receipts."
          },
          {
            step: 3,
            title: "Delete Unneeded Conversations",
            description: "Hover over any conversation in the list and click the red trash icon to permanently remove the thread."
          }
        ]
      },
      {
        id: "execution-timeline",
        title: "Reading the Orchestrator Timeline & Telemetry",
        badge: "Overview",
        summary: "Every response in the Agent Workspace is accompanied by transparent, ground-truth execution telemetry so you know exactly how the AI arrived at its conclusions.",
        highlights: [
          {
            label: "Supervisor Thought Visualizer",
            description: "Click on the reasoning drawer to see how the lead agent broken down your prompt into discrete steps."
          },
          {
            label: "Specialist Tool Execution Cards",
            description: "View individual cards for each tool invocation (e.g. database lookups, document searches, email drafts) showing latency in milliseconds and execution status."
          },
          {
            label: "Token Consumption & Cost Ledger",
            description: "Inspect total input tokens, output tokens, and reasoning tokens consumed during the request, along with real-time dollar cost estimates."
          }
        ]
      },
      {
        id: "chat-typography",
        title: "Live Prompt Typography & Theme Personalization",
        badge: "User Guide",
        summary: "Tailor the text density and visual comfort of the Agent Workspace to match your reading preferences.",
        highlights: [
          {
            label: "Adjustable Prompt Font Size",
            description: "Slide font sizing from 14px (compact code view) up to 20px (large, high-readability text). The prompt input field updates instantly in real-time."
          },
          {
            label: "Font Family Pairing",
            description: "Switch seamlessly between modern Sans-serif, classic Serif, or technical Monospace typography."
          }
        ]
      }
    ]
  },
  {
    id: "capability-studio",
    title: "Module 3: Capability Studio (Building Skills & Flows)",
    shortTitle: "3. Capability Studio",
    icon: BrainCircuit,
    description: "Discover how to inspect agent skills, customize tool capabilities, and visually construct automated multi-agent workflows.",
    sections: [
      {
        id: "what-are-skills",
        title: "What are Skills in SavazAI?",
        badge: "Overview",
        summary: "Skills are modular capabilities that expand what your AI agents can accomplish. Think of skills as specialized playbooks or tools that teach agents how to perform specific business procedures—such as generating formatted PDF reports, performing deep web searches, querying financial databases, or dispatching email notices.",
        highlights: [
          {
            label: "Self-Contained Instructions",
            description: "Each skill defines what information it requires from the user, what checks it performs, and how it delivers results."
          },
          {
            label: "Dynamic Tool Binding",
            description: "Agents automatically recognize and load relevant skills whenever a user prompt calls for that capability."
          }
        ]
      },
      {
        id: "skills-catalog",
        title: "Exploring the Universal Skills Catalog",
        badge: "User Guide",
        summary: "Browse and inspect all registered capabilities available across your organization.",
        steps: [
          {
            step: 1,
            title: "Open Capability Studio",
            description: "Click 'Capability Studio' in the sidebar navigation or visit /studio."
          },
          {
            step: 2,
            title: "Browse Registered Skills",
            description: "Review skill cards showing the skill name, functional description, and required parameters."
          },
          {
            step: 3,
            title: "Inspect Input & Output Requirements",
            description: "Click any skill card to review its parameter fields, validation rules, and expected response format."
          }
        ]
      },
      {
        id: "visual-flow-builder",
        title: "Visual Agent Flow Canvas Builder",
        badge: "How-To Guide",
        summary: "Build multi-step, multi-agent automated business workflows using our drag-and-drop visual canvas.",
        steps: [
          {
            step: 1,
            title: "Create a New Agent Flow",
            description: "Click '+ New Agentflow', enter a descriptive name (e.g. 'Customer Onboarding Pipeline'), and open the canvas editor."
          },
          {
            step: 2,
            title: "Add Workflow Nodes",
            description: "Drag nodes onto the canvas: Trigger nodes to receive requests, Supervisor nodes to route decisions, Worker nodes to execute skills, and Synthesizer nodes to generate reports."
          },
          {
            step: 3,
            title: "Connect Node Relationships",
            description: "Draw connection lines between node ports to define the sequence of execution and data flow."
          },
          {
            step: 4,
            title: "Test Interactively in the Playground",
            description: "Click 'Test Flow' to run a live simulation with sample parameters and inspect the step-by-step execution trace before activating."
          }
        ],
        callout: {
          type: "tip",
          title: "Template Export & Import",
          message: "You can export your completed Agentflows as clean JSON template files to share with teammates or import pre-built company workflows with one click."
        }
      }
    ]
  },
  {
    id: "business-center",
    title: "Module 4: Business Center (Enterprise Knowledge & Governance)",
    shortTitle: "4. Business Center",
    icon: Library,
    description: "Manage organizational knowledge (OKF), upload corporate policy documents, and inspect compliance audit logs.",
    sections: [
      {
        id: "what-is-okf",
        title: "Organizational Knowledge Framework (OKF)",
        badge: "Overview",
        summary: "The Organizational Knowledge Framework (OKF) is your enterprise's central intelligence repository. By grounding agents in OKF, you guarantee that AI answers reflect your exact corporate SOPs, internal policies, vendor guidelines, and compliance rules—eliminating hallucinations.",
        highlights: [
          {
            label: "Semantic Document Search",
            description: "When an agent is asked a question, it automatically searches your knowledge repository to retrieve the most relevant paragraphs and policy rules."
          },
          {
            label: "Domain Namespacing",
            description: "Organize documents into clean business categories (such as 'HR Policies', 'Financial Audit Rules', 'Product Specs') so agents retrieve targeted context without confusion."
          }
        ]
      },
      {
        id: "document-ingestion",
        title: "How to Ingest Business Documents",
        badge: "How-To Guide",
        summary: "Upload company documentation directly into the knowledge base in seconds.",
        steps: [
          {
            step: 1,
            title: "Navigate to Business Center",
            description: "Click 'Business Center' in the sidebar or visit /business."
          },
          {
            step: 2,
            title: "Select 'Universal Skills Registry' or 'OKF Concepts'",
            description: "Choose the knowledge category that matches your content."
          },
          {
            step: 3,
            title: "Upload or Paste Documentation",
            description: "Upload supported files (Markdown .md, PDF documents, Plain Text, or JSON schemas) or type content directly into the editor."
          },
          {
            step: 4,
            title: "Save & Index",
            description: "Click 'Save & Ingest'. The platform automatically parses the document, creates semantic chunks, and indexes it into the vector database for immediate agent access."
          }
        ]
      },
      {
        id: "governance-audit-logs",
        title: "Compliance Governance & Audit Trail",
        badge: "Safety Rule",
        summary: "SavazAI maintains a transparent, immutable record of all agent operations for compliance, auditability, and cost tracking.",
        highlights: [
          {
            label: "Automated Data Masking Gateway",
            description: "Sensitive Personal Identifiable Information (PII) such as SSNs, credit card numbers, phone numbers, and customer emails are automatically detected and replaced with secure placeholder tokens before prompts leave the system."
          },
          {
            label: "Operational Audit Log",
            description: "Review comprehensive records detailing the exact date/time, model used, latency in milliseconds, tools invoked, and token expenditure for every user interaction."
          },
          {
            label: "Policy Enforcement Verification",
            description: "Ensure that all agent actions comply strictly with internal company guardrails and industry regulations (HIPAA, GDPR, SOC2)."
          }
        ]
      }
    ]
  },
  {
    id: "command-center",
    title: "Module 5: Command Center (Platform Settings & Customization)",
    shortTitle: "5. Command Center",
    icon: Settings,
    description: "Configure AI model providers, personalize workspace themes, adjust font typography, and manage interface layouts.",
    sections: [
      {
        id: "llm-provider-vault",
        title: "Connecting AI Providers & Dynamic Model Discovery",
        badge: "Admin Only",
        summary: "Platform Administrators can configure connections to leading AI providers in the Command Center.",
        steps: [
          {
            step: 1,
            title: "Navigate to Command Center",
            description: "Click 'Command Center' in the sidebar or visit /admin/settings, then select the 'LLM Providers' tab."
          },
          {
            step: 2,
            title: "Select Your Preferred Provider",
            description: "Choose between Google Gemini, Anthropic Claude, OpenAI, Groq, xAI, or local Ollama/LM Studio endpoints."
          },
          {
            step: 3,
            title: "Enter API Key & Test Connection",
            description: "Paste your API key and click 'Test Connection'. The platform tests connectivity and automatically discovers all available models live."
          },
          {
            step: 4,
            title: "Save & Activate",
            description: "Click 'Save Changes'. Your key is encrypted with AES-256 military-grade encryption and models become available instantly across the workspace."
          }
        ],
        callout: {
          type: "admin",
          title: "Dynamic Model Discovery",
          message: "When you add a provider key (e.g. Google Gemini), SavazAI automatically fetches all active generation models without requiring a server reboot."
        }
      },
      {
        id: "appearance-typography-guide",
        title: "Appearance, Theme & Typography Customization",
        badge: "User Guide",
        summary: "Customize the look and feel of the platform to match your branding or personal comfort.",
        steps: [
          {
            step: 1,
            title: "Open Appearance Settings",
            description: "In Command Center (/admin/settings), select the 'Appearance' tab."
          },
          {
            step: 2,
            title: "Adjust Prompt Font Size Slider",
            description: "Drag the slider to set your chat input size between 14px (compact) and 20px (large). Preview the live text box below the slider."
          },
          {
            step: 3,
            title: "Choose Font Family & Theme Colors",
            description: "Select your preferred font family (Sans, Serif, Monospace) and configure primary/secondary brand accent colors."
          },
          {
            step: 4,
            title: "Toggle Sidebar Tabs",
            description: "Use the toggle switch to show or hide specific workspace modules (like 'Agent Workspace') for a tailored sidebar experience."
          }
        ]
      }
    ]
  },
  {
    id: "user-admin",
    title: "Module 6: User Administration (Admin Role Only)",
    shortTitle: "6. User Admin",
    icon: Users,
    description: "Step-by-step guide for administrators on user provisioning, role assignments, password resets, and account security.",
    sections: [
      {
        id: "admin-access-notice",
        title: "User Administration Overview",
        badge: "Admin Only",
        summary: "The User Administration center (/admin/users) provides centralized Role-Based Access Control (RBAC) management. This module is strictly restricted to platform administrators.",
        callout: {
          type: "admin",
          title: "Restricted to Administrators",
          message: "Only team members with the 'admin' role can view, create, edit, or delete user accounts. Standard users cannot access this module."
        }
      },
      {
        id: "adding-users",
        title: "How to Provision New Team Members",
        badge: "Admin Only",
        summary: "Add new employees, contractors, or administrators to your SavazAI workspace.",
        steps: [
          {
            step: 1,
            title: "Open User Administration",
            description: "Click 'User Admin' in the sidebar or navigate to /admin/users."
          },
          {
            step: 2,
            title: "Click '+ Add New User'",
            description: "Click the primary action button to open the user provisioning modal."
          },
          {
            step: 3,
            title: "Fill in Team Member Details",
            description: "Enter their Full Name, valid Email Address, Role (User or Admin), and an initial secure Password (minimum 6 characters)."
          },
          {
            step: 4,
            title: "Confirm Creation",
            description: "Click 'Create User'. The account is immediately created and ready for sign-in."
          }
        ]
      },
      {
        id: "managing-users",
        title: "Managing Existing Accounts, Roles & Password Resets",
        badge: "Admin Only",
        summary: "Modify permissions, update details, or perform password resets for existing members.",
        highlights: [
          {
            label: "Role Elevations & Demotions",
            description: "Click 'Edit' on any user row to elevate a standard User to Administrator or demote an admin to User."
          },
          {
            label: "Secure Password Resets",
            description: "Admins can input a new temporary password in the Edit dialog to reset credentials for a team member."
          },
          {
            label: "Account Deletions & Clean Cleanup",
            description: "Click the red trash icon to delete an account when an employee leaves. The system automatically cleans up all associated sessions."
          }
        ]
      },
      {
        id: "safety-safeguards",
        title: "Anti-Lockout & Self-Preservation Safeguards",
        badge: "Safety Rule",
        summary: "SavazAI includes built-in safety invariants that protect organizations from accidental administrator lockouts.",
        highlights: [
          {
            label: "Self-Demotion Prevention",
            description: "An active administrator cannot demote their own account to 'User' while logged in, ensuring the platform always maintains administrative access."
          },
          {
            label: "Self-Deletion Prevention",
            description: "An active administrator cannot delete their own account from the User Admin table."
          },
          {
            label: "Duplicate Email Protection",
            description: "The system prevents creating duplicate accounts with identical email addresses to maintain clean user registries."
          }
        ]
      }
    ]
  },
  {
    id: "permissions-matrix",
    title: "Module 7: Feature & Permissions Summary Reference",
    shortTitle: "7. Roles & Matrix",
    icon: ShieldCheck,
    description: "Comprehensive summary table comparing exact permissions and capabilities available to Standard Users vs Platform Administrators.",
    sections: [
      {
        id: "summary-table",
        title: "Workspace Permissions Comparison Matrix",
        badge: "Overview",
        summary: "Reference table outlining capabilities across all platform modules for standard team members versus platform administrators:",
        table: {
          headers: ["Workspace Module", "Feature / Action", "Standard User", "Platform Administrator"],
          rows: [
            ["Agent Workspace", "Run AI agent workflows & live chat", "Yes (Full Access)", "Yes (Full Access)"],
            ["Agent Workspace", "Manage personal conversation threads", "Yes (Full Access)", "Yes (Full Access)"],
            ["Agent Workspace", "Inspect execution reasoning & latency", "Yes (Full Access)", "Yes (Full Access)"],
            ["Capability Studio", "View & test agent skills and tools", "Yes (Full Access)", "Yes (Full Access)"],
            ["Capability Studio", "Create, edit & test visual Agentflows", "Yes (Full Access)", "Yes (Full Access)"],
            ["Business Center", "Upload documents & query OKF knowledge", "Yes (Full Access)", "Yes (Full Access)"],
            ["Business Center", "View governance logs & cost tracking", "Yes (Full Access)", "Yes (Full Access)"],
            ["Documentation Hub", "Read user guides & operational manuals", "Yes (Full Access)", "Yes (Full Access)"],
            ["Command Center", "Customize prompt font size & themes", "Yes (Personal)", "Yes (Global & Personal)"],
            ["Command Center", "Configure encrypted LLM provider API keys", "View Only", "Yes (Full Access)"],
            ["User Admin", "Provision, edit, reset, or delete accounts", "No Access (Hidden / 403)", "Yes (Full Access)"]
          ]
        }
      }
    ]
  }
];

export default function DocsPage() {
  const [activeModuleId, setActiveModuleId] = useState<string>("getting-started");
  const [activeSectionId, setActiveSectionId] = useState<string>("what-is-savazai");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Search filter across all modules, sections, summaries, steps, and highlights
  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return DOCS_MODULES;
    const q = searchQuery.toLowerCase();

    return DOCS_MODULES.map((mod) => {
      const matchedSections = mod.sections.filter(
        (sec) =>
          sec.title.toLowerCase().includes(q) ||
          sec.summary.toLowerCase().includes(q) ||
          (sec.badge && sec.badge.toLowerCase().includes(q)) ||
          sec.highlights?.some((h) => h.label.toLowerCase().includes(q) || h.description.toLowerCase().includes(q)) ||
          sec.steps?.some((s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) ||
          (sec.callout && (sec.callout.title.toLowerCase().includes(q) || sec.callout.message.toLowerCase().includes(q))) ||
          sec.table?.rows.some((row) => row.some((cell) => cell.toLowerCase().includes(q)))
      );
      return {
        ...mod,
        sections: matchedSections,
      };
    }).filter((mod) => mod.sections.length > 0 || mod.title.toLowerCase().includes(q));
  }, [searchQuery]);

  const activeModule = useMemo(() => {
    return filteredModules.find((mod) => mod.id === activeModuleId) || filteredModules[0] || DOCS_MODULES[0];
  }, [filteredModules, activeModuleId]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Header & Search Bar */}
      <div className="shrink-0 border-b border-slate-900 bg-slate-950/90 px-6 py-4 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                SavazAI Platform &amp; User Manual
              </h1>
              <p className="text-slate-400 text-xs">
                Comprehensive step-by-step guides, operational workflows, and feature walkthroughs
              </p>
            </div>
          </div>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search guides, how-to steps, features..."
            className="w-full pl-10 pr-12 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300 px-1.5 py-0.5 rounded bg-slate-800"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-72 shrink-0 border-r border-slate-900 bg-slate-950/60 overflow-y-auto p-4 space-y-6 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-900">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3 px-2">
              User &amp; Operator Manual
            </div>
            <nav className="space-y-1">
              {filteredModules.map((mod) => {
                const IconComponent = mod.icon;
                const isActive = mod.id === activeModule.id;
                return (
                  <div key={mod.id} className="space-y-0.5">
                    <button
                      onClick={() => {
                        setActiveModuleId(mod.id);
                        if (mod.sections.length > 0) {
                          setActiveSectionId(mod.sections[0].id);
                        }
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                        isActive
                          ? "bg-primary/20 text-primary border border-primary/30 font-bold"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent"
                      }`}
                    >
                      <IconComponent className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-slate-500"}`} />
                      <span className="truncate flex-1">{mod.shortTitle}</span>
                      {isActive && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>

                    {/* Sub-sections */}
                    {isActive && mod.sections.length > 0 && (
                      <div className="ml-6 pl-2 border-l border-slate-800/80 space-y-0.5 py-1">
                        {mod.sections.map((sec) => (
                          <button
                            key={sec.id}
                            onClick={() => {
                              setActiveSectionId(sec.id);
                              const el = document.getElementById(sec.id);
                              if (el) el.scrollIntoView({ behavior: "smooth" });
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium truncate transition-all block ${
                              activeSectionId === sec.id
                                ? "text-white bg-slate-900 font-semibold"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/30"
                            }`}
                          >
                            {sec.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          <div className="p-3.5 rounded-2xl bg-indigo-950/20 border border-indigo-500/20">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-300 mb-1">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              Need Personal Assistance?
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Explore our interactive workspace tabs or reach out to your organization&apos;s designated SavazAI administrator.
            </p>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800">
          {/* Module Banner */}
          <div className="border-b border-slate-900 pb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 mb-3">
              <activeModule.icon className="h-3.5 w-3.5" />
              User &amp; Operator Guide
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              {activeModule.title}
            </h2>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed max-w-4xl">
              {activeModule.description}
            </p>
          </div>

          {/* Sections List */}
          <div className="space-y-10">
            {activeModule.sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-6 p-6 md:p-8 rounded-3xl border border-slate-900 bg-slate-900/15 space-y-6"
              >
                {/* Section Header with Badge */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-900/80 pb-4">
                  <h3 className="text-lg md:text-xl font-bold text-white flex items-center gap-2.5">
                    <span>{section.title}</span>
                  </h3>
                  {section.badge && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border ${
                        section.badge === "Admin Only"
                          ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                          : section.badge === "Safety Rule"
                          ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                          : section.badge === "How-To Guide"
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                      }`}
                    >
                      {section.badge === "Admin Only" && <ShieldAlert className="h-3.5 w-3.5" />}
                      {section.badge === "Safety Rule" && <Lock className="h-3.5 w-3.5" />}
                      {section.badge === "How-To Guide" && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {section.badge === "User Guide" && <Bot className="h-3.5 w-3.5" />}
                      {section.badge}
                    </span>
                  )}
                </div>

                {/* Section Summary */}
                <p className="text-slate-300 text-sm leading-relaxed">
                  {section.summary}
                </p>

                {/* Optional How-To Steps */}
                {section.steps && section.steps.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      Step-by-Step Instructions:
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {section.steps.map((st) => (
                        <div
                          key={st.step}
                          className="flex items-start gap-3.5 p-4 rounded-2xl border border-slate-800 bg-slate-950/60"
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
                            {st.step}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white mb-0.5">{st.title}</h4>
                            <p className="text-slate-400 text-xs leading-relaxed">{st.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Optional Highlight Cards */}
                {section.highlights && section.highlights.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {section.highlights.map((h, hIdx) => (
                      <div
                        key={hIdx}
                        className="p-4 rounded-2xl border border-slate-800/80 bg-slate-950/40 space-y-1.5"
                      >
                        <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                          {h.label}
                        </h4>
                        <p className="text-slate-400 text-xs leading-relaxed">
                          {h.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Optional Visual Callout Box */}
                {section.callout && (
                  <div
                    className={`p-4 rounded-2xl border flex items-start gap-3 ${
                      section.callout.type === "admin"
                        ? "bg-rose-950/20 border-rose-500/30 text-rose-200"
                        : section.callout.type === "important"
                        ? "bg-amber-950/20 border-amber-500/30 text-amber-200"
                        : "bg-indigo-950/20 border-indigo-500/30 text-indigo-200"
                    }`}
                  >
                    {section.callout.type === "admin" ? (
                      <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                    ) : section.callout.type === "important" ? (
                      <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    ) : (
                      <Info className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h4 className="text-xs font-bold mb-1 text-white">{section.callout.title}</h4>
                      <p className="text-xs text-slate-300 leading-relaxed">{section.callout.message}</p>
                    </div>
                  </div>
                )}

                {/* Optional Comparison Table */}
                {section.table && (
                  <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 mt-4">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-300 font-semibold border-b border-slate-800">
                        <tr>
                          {section.table.headers.map((header, idx) => (
                            <th key={idx} className="px-4 py-3.5 font-bold">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900 text-slate-400">
                        {section.table.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-900/40 transition-colors">
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className={`px-4 py-3.5 ${
                                  cIdx === 0 ? "font-semibold text-slate-200" : ""
                                } ${cIdx === 2 && cell.includes("No Access") ? "text-rose-400 font-semibold" : ""} ${
                                  cIdx === 3 && cell.includes("Full Access") ? "text-emerald-400 font-semibold" : ""
                                }`}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </div>

          {/* Footer Guide Signoff */}
          <div className="border-t border-slate-900 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div>SavazAI Platform User Manual &bull; Designed for Enterprise Teams</div>
            <div className="flex items-center gap-3">
              <span>Need help? Contact your workspace administrator</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
