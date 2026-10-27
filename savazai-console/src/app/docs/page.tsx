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
    description: "Welcome to SavazAI. Learn the fundamentals of our sovereign multi-agent OS, console navigation, tokenized invite onboarding, and RBAC security profiles.",
    sections: [
      {
        id: "what-is-savazai",
        title: "What is SavazAI?",
        badge: "Overview",
        summary: "SavazAI is a sovereign, enterprise-grade multi-agent operating system designed to orchestrate autonomous AI workflows with total reliability, mathematical determinism, and Zero-Trust governance. Rather than simple conversational wrappers, SavazAI coordinates specialized agents that analyze data, invoke registered tools over Model Context Protocol (MCP), reference enterprise ground truth (OKF), and execute complex business SOPs with human oversight.",
        highlights: [
          {
            label: "Deterministic Multi-Agent Coordination",
            description: "Agents collaborate in structured teams: Supervisor agents formulate plans, Specialist workers execute designated tasks, and Synthesizers summarize results into executive reports."
          },
          {
            label: "Enterprise Knowledge Grounding (OKF)",
            description: "Agents reference verified organizational documentation to ensure every response aligns strictly with corporate policies and domain truth."
          },
          {
            label: "Total Privacy & Data Masking Gateway",
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
            description: "The primary interactive environment where you chat with multi-agent teams, inspect live system traces, and track execution telemetry in real-time."
          },
          {
            label: "Capability Studio (/studio)",
            description: "The visual workflow studio where you build visual Agentflows, organize Collapsible Agent Teams, and bind skills with tabular tool selectors."
          },
          {
            label: "Business Center (/business)",
            description: "The organizational knowledge hub where you manage Universal Skills, OKF Concepts, Compliance Logs, and assign skills to worker agents."
          },
          {
            label: "Documentation Hub (/docs)",
            description: "This comprehensive user manual with step-by-step guides, operational procedures, and permissions reference."
          },
          {
            label: "Command Center (/admin/settings)",
            description: "Platform settings for prompt font sizing, Light/Dark appearance, accent palettes, LLM providers, and System Admin email/CAPTCHA controls."
          },
          {
            label: "User Admin (/admin/users)",
            description: "Administrative 3-sub-tab hub for managing Active Users, Pending Approvals Queue, and Roles & Access Profiles (Restricted to Administrators)."
          },
          {
            label: "Profile Hub (/profile)",
            description: "Self-service settings for updating personal credentials, avatar upload, and inspecting assigned granular RBAC permissions."
          }
        ]
      },
      {
        id: "tokenized-onboarding-captcha",
        title: "Obfuscated Tokenized Onboarding & CAPTCHA Bot Defense",
        badge: "Safety Rule",
        summary: "SavazAI enforces an attack-surface minimized onboarding architecture that completely eliminates open registration and automated bot account creation.",
        steps: [
          {
            step: 1,
            title: "Admin Generates Cryptographic Invitation",
            description: "An administrator generates an invitation in User Admin with an optional expiry date and direct email dispatch toggle. The system creates a single-use SHA-256 token."
          },
          {
            step: 2,
            title: "Candidate Accesses Secret Onboarding Route",
            description: "The invitee receives a secure link (e.g. /access-portal/invitation?token=...) protected by Cloudflare Turnstile CAPTCHA bot verification."
          },
          {
            step: 3,
            title: "Email OTP Verification",
            description: "Upon form submission, a 6-digit one-time password (OTP) is dispatched to their email via SMTP. The token is immediately invalidated once verified."
          },
          {
            step: 4,
            title: "Automatic Quarantine in Pending Approvals",
            description: "The applicant's account is created with status = 'PENDING_APPROVAL' with zero system permissions until an administrator explicitly reviews and approves them."
          }
        ],
        callout: {
          type: "admin",
          title: "Zero Open Registration Invariant",
          message: "Public /signup routes are permanently disabled. Unauthorized visitors attempting to create accounts directly receive 403 Forbidden responses."
        }
      },
      {
        id: "understanding-roles",
        title: "Understanding User Roles & Access Profiles",
        badge: "Safety Rule",
        summary: "SavazAI implements a fine-grained 53-permission Role-Based Access Control (RBAC) matrix grouped under 6 predefined enterprise profiles alongside custom profile support.",
        highlights: [
          {
            label: "Super Administrator",
            description: "Holds all 53 permissions across all platform modules, system settings, user provisioning, and credential vaults."
          },
          {
            label: "Studio Flow Architect",
            description: "Full read/write authoring access in Capability Studio, visual canvas editing, skill testing, and documentation."
          },
          {
            label: "Workspace Operator",
            description: "Operational access in Agent Workspace to execute published agentflows, approve HITL parameter cards, run Direct MCP queries, and review documentation."
          },
          {
            label: "Business Policy Manager",
            description: "Full management of Universal Skills, OKF Concepts, compliance audit logs, and agent assignment workflows in Business Center."
          },
          {
            label: "Infrastructure Lead",
            description: "Complete administration of Command Center: LLM provider vaults, MCP server configurations, system email/SMTP, and appearance tokens."
          },
          {
            label: "Auditor",
            description: "Strictly read-only inspection access across workspace telemetry, execution receipts, and compliance logs."
          }
        ]
      }
    ]
  },
  {
    id: "agent-workspace",
    title: "Module 2: Agent Workspace (Live AI Operations)",
    shortTitle: "2. Agent Workspace",
    icon: Bot,
    description: "Learn how to interact with multi-agent teams, toggle between Published Agentflows and Direct MCP Chat, inspect execution telemetry, and manage workspace tools.",
    sections: [
      {
        id: "workspace-execution-modes",
        title: "Dual Execution Modes: Published Agentflows vs Direct MCP Chat",
        badge: "Overview",
        summary: "The Agent Workspace provides two distinct execution modes, cleanly decoupled to serve different operational requirements.",
        highlights: [
          {
            label: "Mode 1: Published Agentflows (Multi-Agent LangGraph Engine)",
            description: "Used for high-governance business processes designed in Capability Studio. The orchestrator compiles a full multi-agent pipeline: a Supervisor Node formulates an execution plan, Specialist Teams and Worker Nodes invoke tools, and a Synthesizer Node outputs clean executive summaries. Supports Plan-First Human-in-the-Loop approval cards."
          },
          {
            label: "Mode 2: Direct MCP Chat (High-Speed Conversational AI)",
            description: "Used for direct ad-hoc querying of connected Model Context Protocol (MCP) servers (e.g. NSE Bhavcopy, CM Market, GitHub). Operates without supervisor overhead or plan approval cards. Dynamically binds only the tools from explicitly selected servers using native LLM function calling."
          }
        ],
        callout: {
          type: "tip",
          title: "Switching Modes",
          message: "Use the top execution selector in Agent Workspace to toggle between 'Published Flow' (select any compiled workflow from Capability Studio) and 'Direct MCP' (select one or more connected MCP servers)."
        }
      },
      {
        id: "hitl-plan-approval",
        title: "Human-in-the-Loop (HITL) Plan-First Approval Protocol",
        badge: "User Guide",
        summary: "In Published Agentflow mode, when 'Plan First' execution is active, the system presents an interactive Plan-First Approval Card before specialist workers execute tools.",
        steps: [
          {
            step: 1,
            title: "Plan Formulation",
            description: "The Supervisor analyzes your prompt, breaks down required steps, and pauses execution at the approval boundary (PENDING_APPROVAL)."
          },
          {
            step: 2,
            title: "Parameter Review & Input",
            description: "Any missing business parameters are displayed in an interactive clarification form. Technical internal IDs (such as database UUIDs) are automatically resolved behind the scenes."
          },
          {
            step: 3,
            title: "Operator Decision Actions",
            description: "Choose one of 4 interactive actions: 'Approve & Execute Plan' (resumes worker execution), 'Submit Details & Execute' (submits parameters and executes), 'Adjust & Re-Plan' (provides instructions to revise the plan), or 'Reject & Re-Plan' (discards the plan)."
          }
        ]
      },
      {
        id: "system-trace-telemetry",
        title: "Collapsible System Trace & Chunk Deduplication",
        badge: "How-To Guide",
        summary: "Inspect low-level agent routing, privacy masking, tool invocations, and synthesis events without cluttering your conversation message bubbles.",
        highlights: [
          {
            label: "Collapsible Sidebar Panel",
            description: "Click the toggle or the floating docked button to expand or collapse the System Trace panel. Your panel visibility state is automatically remembered in browser storage."
          },
          {
            label: "Stream Chunk Deduplication",
            description: "Instead of dozens of repetitive 'LLM Chunk (64 chars received)' notifications, streaming chunks are consolidated into a live-updating counter: 'LLM Chunk Streaming (X total characters received)'."
          },
          {
            label: "Structured Event Taxonomy",
            description: "Traces are tagged with clean system badges: [ROUTING] for Supervisor dispatch, [MASKING] for PII tokenization, [TOOL_INVOCATION] for execution, [TOOL_OUTPUT] for payloads, and [SYNTHESIS] for executive summaries."
          }
        ]
      },
      {
        id: "multi-server-direct-mcp",
        title: "Multi-Server Direct MCP Selector & Auto-Dismiss",
        badge: "User Guide",
        summary: "In Direct MCP mode, easily bind multiple remote MCP servers simultaneously with responsive dropdown controls.",
        highlights: [
          {
            label: "Click-Outside & Escape Auto-Close",
            description: "The server selection dropdown automatically dismisses when you click anywhere outside the popup or press the Escape key."
          },
          {
            label: "Explicit 'Apply & Close' Action",
            description: "Toggle servers via multi-select checkboxes and click '[ Apply & Close ]' to confirm active tool bindings immediately."
          },
          {
            label: "Compact Multi-Server Badge",
            description: "When multiple servers are selected, the trigger pill displays a concise summary such as 'MCP: 2 Active (nse-bhavcopy, cm-market)'."
          }
        ]
      },
      {
        id: "conversation-threads",
        title: "Managing Persistent Conversation Threads & History",
        badge: "User Guide",
        summary: "Every turn in both Direct MCP mode and Published Agentflows is automatically stored in PostgreSQL thread memory (agentflow_thread_memory) for persistent task continuity.",
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
      }
    ]
  },
  {
    id: "capability-studio",
    title: "Module 3: Capability Studio (Building Skills & Flows)",
    shortTitle: "3. Capability Studio",
    icon: BrainCircuit,
    description: "Discover how to inspect agent skills, build visual Agentflows, coordinate Collapsible Agent Teams, and use tabular tool selectors.",
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
        id: "collapsible-agent-teams",
        title: "Collapsible Agent Teams & Bus Routing",
        badge: "How-To Guide",
        summary: "Organize complex multi-agent architectures into clean, modular containers on the visual canvas.",
        highlights: [
          {
            label: "Team Container Nodes",
            description: "Group multiple specialist workers into an expandable/collapsible team container to reduce visual clutter."
          },
          {
            label: "Bus Pipeline Routing",
            description: "Connections routed into a Team Container automatically distribute execution requests to member specialists based on tool capability."
          },
          {
            label: "Custom Node Theming",
            description: "Customize node border colors, glow effects, and visual badges (Emerald, Cyan, Indigo, Amber, Rose, Slate) for instant visual distinction."
          }
        ]
      },
      {
        id: "tabular-tool-selectors",
        title: "Tabular Tool & Knowledge Selectors (ToolDataTable)",
        badge: "User Guide",
        summary: "Manage agent tool bindings using clean, searchable, and filterable data tables rather than unwieldy card stacks.",
        highlights: [
          {
            label: "Search & Category Filters",
            description: "Quickly filter tools across Native TS, Open Agents, MCP Servers, and Custom Webhooks with live text search."
          },
          {
            label: "Bulk Enable & Disable",
            description: "Select multiple tools and toggle their active binding across specialist agents with one click."
          },
          {
            label: "Interactive Toggle Switches",
            description: "Turn individual tools on or off with tactile status indicators showing Active, Inactive, or Needs Key."
          }
        ]
      },
      {
        id: "wysiwyg-prompt-editor",
        title: "Universal Dual-Mode Markdown WYSIWYG Editor",
        badge: "User Guide",
        summary: "Author system directive prompts with rich formatting controls, live preview, and variable badge highlighting.",
        highlights: [
          {
            label: "Rich Formatting Toolbar",
            description: "Format prompts with Bold, Italic, Strikethrough, Headings (H1-H3), Bullet/Numbered Lists, Code Blocks, and Tables."
          },
          {
            label: "Split / Edit / Preview Modes",
            description: "Switch between raw Markdown editing, side-by-side split view, or rendered HTML preview to inspect prompt layout."
          },
          {
            label: "Dynamic Variable Tagging",
            description: "Dynamic runtime placeholders like {input}, {context}, or {user} are automatically styled with highlighted badge tags."
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
            description: "Click '+ New Agentflow', enter a descriptive name, and open the canvas editor."
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
            description: "Click 'Test Flow' to run a live simulation with sample parameters and inspect the step-by-step execution trace before publishing."
          }
        ]
      }
    ]
  },
  {
    id: "business-center",
    title: "Module 4: Business Center (Enterprise Knowledge & Governance)",
    shortTitle: "4. Business Center",
    icon: Library,
    description: "Manage organizational knowledge (OKF), author Universal Skills, assign skills to worker agents, and inspect compliance audit logs.",
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
        id: "agent-assignment-hub",
        title: "Agent Assignment Hub (Assign to Agents Modal)",
        badge: "User Guide",
        summary: "Seamlessly bind or unbind business skills across specialist agents in your published and draft flows directly from the Skills Registry table.",
        steps: [
          {
            step: 1,
            title: "Click 'Active in Agents' Badges",
            description: "In the Universal Skills Registry table, click on any agent badge or the '+ Assign Agents' button."
          },
          {
            step: 2,
            title: "Select Worker Agents Across Flows",
            description: "The interactive modal displays all published and draft agentflows. Check or uncheck specialist worker nodes to grant or revoke access to the skill."
          },
          {
            step: 3,
            title: "Save & Synchronize",
            description: "Click 'Save Assignments'. The engine automatically updates the agentflow canvas definitions and saves them to PostgreSQL."
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
    description: "Configure AI model providers, personalize Light/Dark themes, adjust typography and colors, and manage System Admin email/CAPTCHA settings.",
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
        ]
      },
      {
        id: "system-admin-services",
        title: "System Admin: Email SMTP, CAPTCHA Bot Defense & Audit Logs",
        badge: "Admin Only",
        summary: "Configure core infrastructure services in the dedicated System Admin sub-hub within Command Center.",
        highlights: [
          {
            label: "Email & SMTP Service",
            description: "Configure Custom SMTP, Gmail App Password, or SendGrid API with host, port, TLS toggle, and encrypted credentials. Includes an interactive 'Send Test Email' dialog with live Nodemailer verification."
          },
          {
            label: "Cloudflare Turnstile CAPTCHA",
            description: "Protect invitation onboarding routes from automated bot scripts by entering your Cloudflare Turnstile Site Key and Secret Key."
          },
          {
            label: "Outbound Email & OTP Audit Log",
            description: "Inspect chronological dispatch logs recording recipient addresses, template types (Invitation, OTP, Alert), message IDs, delivery status, and error diagnostics."
          }
        ]
      },
      {
        id: "appearance-theme-engine",
        title: "Global Light/Dark Theme Engine & Appearance Customizer",
        badge: "User Guide",
        summary: "Customize the visual appearance of the console with instant theme switching, typography pairings, font scale adjustments, and brand color presets.",
        highlights: [
          {
            label: "Light / Dark / System Themes",
            description: "Switch seamlessly between high-contrast Light mode and refined Dark mode via the sidebar toggle or Appearance settings, backed by anti-flicker head scripts."
          },
          {
            label: "Typography & Font Scales",
            description: "Choose between Sans, Serif, or Monospace typography and adjust the font size scale across Compact (13px), Standard (14px), Relaxed (15px), and Large (16px)."
          },
          {
            label: "Brand Accent Presets & Custom Hex",
            description: "Select from curated brand palettes (Indigo, Amber, Emerald, Sky, Rose) or enter a custom hex color code to align the console with your corporate identity."
          },
          {
            label: "Canvas Background Surface Shades",
            description: "Tailor the workflow canvas background darkness or lightness to optimize visual clarity during extended design sessions."
          }
        ]
      }
    ]
  },
  {
    id: "user-admin",
    title: "Module 6: Enterprise User Administration & RBAC Profiles",
    shortTitle: "6. User Admin & RBAC",
    icon: Users,
    description: "Step-by-step guide for administrators on user provisioning, approving quarantined applicants, assigning RBAC profiles, and the self-service profile hub.",
    sections: [
      {
        id: "modular-user-admin",
        title: "Modular 3-Sub-Tab User Administration Hub",
        badge: "Admin Only",
        summary: "User Administration (/admin/users) provides a comprehensive, segregated layout for managing identity and access governance.",
        highlights: [
          {
            label: "Active Users Directory (Tab 1)",
            description: "View and manage active and suspended operators with live status pills, role editing, account suspension, session revocation, and password resets."
          },
          {
            label: "Pending Approvals Queue (Tab 2)",
            description: "Isolates any applicant registered via tokenized invitation in a quarantined state with zero permissions. Features dynamic count badges and '[ Approve & Assign Profile ]' action."
          },
          {
            label: "Roles & Access Profiles Matrix (Tab 3)",
            description: "Inspect and manage the 6 predefined enterprise system profiles and create custom tailored profiles across the 53 platform permissions."
          }
        ]
      },
      {
        id: "pending-approvals-workflow",
        title: "Pending Approvals Queue & Profile Provisioning",
        badge: "Admin Only",
        summary: "Review, approve, and activate quarantined accounts with a single click.",
        steps: [
          {
            step: 1,
            title: "Inspect Pending Applicant",
            description: "Open the 'Pending Approvals' tab in User Admin to review the applicant's name, email, request date, and invitation token source."
          },
          {
            step: 2,
            title: "Click 'Approve & Assign Profile'",
            description: "Open the approval dialog to assign the applicant to one of the 6 system profiles (e.g. Workspace Operator, Studio Flow Architect) or a custom enterprise role."
          },
          {
            step: 3,
            title: "Confirm Activation",
            description: "Click 'Confirm & Activate Account'. The applicant's status updates to ACTIVE and their assigned permissions take effect immediately."
          }
        ]
      },
      {
        id: "self-service-profile-hub",
        title: "Self-Service Profile Hub (/profile)",
        badge: "User Guide",
        summary: "Every authenticated team member can manage their own personal profile, credentials, and inspect assigned permissions.",
        highlights: [
          {
            label: "Personal Details & Avatar Upload",
            description: "Maintain your display name, geographic region, and upload a custom avatar image."
          },
          {
            label: "Security & Password Management",
            description: "Perform self-service password updates with current password verification, alongside OTP / 2FA status tracking."
          },
          {
            label: "My Access Profile Breakdown",
            description: "Review a transparent, read-only matrix of granted permissions across all platform modules."
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
    description: "Comprehensive summary table comparing exact permissions and capabilities available across the 6 Predefined System Profiles.",
    sections: [
      {
        id: "summary-table",
        title: "Workspace Permissions Comparison Matrix",
        badge: "Overview",
        summary: "Reference table outlining capabilities across all platform modules for standard team members versus platform administrators:",
        table: {
          headers: ["Platform Module", "Feature / Action", "Workspace Operator", "Studio Flow Architect", "Business Policy Mgr", "Super Admin"],
          rows: [
            ["Agent Workspace", "Run Published Agentflows & Chat", "Full Access", "Full Access", "Full Access", "Full Access"],
            ["Agent Workspace", "HITL Plan-First Approval Card", "Full Access", "Full Access", "Full Access", "Full Access"],
            ["Agent Workspace", "Direct MCP Chat & Tool Execution", "Full Access", "Full Access", "Full Access", "Full Access"],
            ["Capability Studio", "View & Test Registered Skills", "Read Only", "Full Access", "Full Access", "Full Access"],
            ["Capability Studio", "Canvas Flow Authoring & Publishing", "No Access", "Full Access", "No Access", "Full Access"],
            ["Business Center", "Manage Universal Skills & OKF", "No Access", "Read Only", "Full Access", "Full Access"],
            ["Business Center", "Assign Skills to Worker Agents", "No Access", "Full Access", "Full Access", "Full Access"],
            ["Business Center", "Compliance Governance & Audit Trail", "No Access", "Read Only", "Full Access", "Full Access"],
            ["Command Center", "Personal Theme, Font & Typography", "Personal", "Personal", "Personal", "Full Access"],
            ["Command Center", "Encrypted LLM Provider Vaults", "No Access", "No Access", "No Access", "Full Access"],
            ["Command Center", "System Admin (SMTP, CAPTCHA, Logs)", "No Access", "No Access", "No Access", "Full Access"],
            ["User Admin", "Approve Quarantined Users & RBAC", "No Access", "No Access", "No Access", "Full Access"],
            ["Profile Hub", "Self-Service Credentials & Avatar", "Personal", "Personal", "Personal", "Personal"]
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
    <div className="flex-1 flex flex-col min-h-0 bg-background text-slate-100 overflow-hidden">
      {/* Top Header & Search Bar */}
      <div className="shrink-0 border-b border-border bg-muted/40 px-6 py-4 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                SavazAI Platform &amp; User Manual
              </h1>
              <p className="text-muted-foreground text-xs">
                Comprehensive step-by-step guides, operational workflows, and feature walkthroughs
              </p>
            </div>
          </div>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search guides, how-to steps, features..."
            className="w-full pl-10 pr-12 py-2 bg-muted/30 border border-border rounded-xl text-xs text-foreground placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-muted-foreground px-1.5 py-0.5 rounded bg-slate-800"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-72 shrink-0 border-r border-border bg-muted/40 overflow-y-auto p-4 space-y-6 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-card">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 px-2">
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
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-transparent"
                      }`}
                    >
                      <IconComponent className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="truncate flex-1">{mod.shortTitle}</span>
                      {isActive && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>

                    {/* Sub-sections */}
                    {isActive && mod.sections.length > 0 && (
                      <div className="ml-6 pl-2 border-l border-border space-y-0.5 py-1">
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
                                ? "text-foreground bg-card font-semibold"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
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
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Explore our interactive workspace tabs or reach out to your organization&apos;s designated SavazAI administrator.
            </p>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800">
          {/* Module Banner */}
          <div className="border-b border-border pb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 mb-3">
              <activeModule.icon className="h-3.5 w-3.5" />
              User &amp; Operator Guide
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">
              {activeModule.title}
            </h2>
            <p className="text-muted-foreground text-sm mt-2 leading-relaxed max-w-4xl">
              {activeModule.description}
            </p>
          </div>

          {/* Sections List */}
          <div className="space-y-10">
            {activeModule.sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-6 p-6 md:p-8 rounded-3xl border border-border bg-muted/30 space-y-6"
              >
                {/* Section Header with Badge */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-4">
                  <h3 className="text-lg md:text-xl font-bold text-foreground flex items-center gap-2.5">
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
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {section.summary}
                </p>

                {/* Optional How-To Steps */}
                {section.steps && section.steps.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      Step-by-Step Instructions:
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {section.steps.map((st) => (
                        <div
                          key={st.step}
                          className="flex items-start gap-3.5 p-4 rounded-2xl border border-border bg-muted/40"
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
                            {st.step}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-foreground mb-0.5">{st.title}</h4>
                            <p className="text-muted-foreground text-xs leading-relaxed">{st.description}</p>
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
                        className="p-4 rounded-2xl border border-border bg-muted/40 space-y-1.5"
                      >
                        <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                          {h.label}
                        </h4>
                        <p className="text-muted-foreground text-xs leading-relaxed">
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
                      <h4 className="text-xs font-bold mb-1 text-foreground">{section.callout.title}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">{section.callout.message}</p>
                    </div>
                  </div>
                )}

                {/* Optional Comparison Table */}
                {section.table && (
                  <div className="overflow-x-auto rounded-2xl border border-border bg-muted/40 mt-4">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-card text-muted-foreground font-semibold border-b border-border">
                        <tr>
                          {section.table.headers.map((header, idx) => (
                            <th key={idx} className="px-4 py-3.5 font-bold">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900 text-muted-foreground">
                        {section.table.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-muted/30 transition-colors">
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className={`px-4 py-3.5 ${
                                  cIdx === 0 ? "font-semibold text-foreground" : ""
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
          <div className="border-t border-border pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
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
