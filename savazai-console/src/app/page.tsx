import Link from "next/link";
import { 
  ShieldCheck, 
  Workflow, 
  Terminal, 
  ArrowRight, 
  ExternalLink, 
  Mail, 
  Layers, 
  Settings, 
  Key, 
  Cpu, 
  Heart, 
  DollarSign, 
  Building2, 
  Scale,
  Bot,
  BookOpen,
  Database,
  Share2,
  Lock,
  Sliders,
  PlaySquare,
  FileCode2,
  Compass,
  Server
} from "lucide-react";
import { getSystemConfig } from "@/components/theme-provider";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function Home() {
  const [config, session] = await Promise.all([
    getSystemConfig(),
    auth.api.getSession({ headers: await headers() }).catch(() => null),
  ]);
  const logoUrl = config.brandLogoUrl || "https://savazar.com/wp-content/uploads/2023/10/cropped-Transparent_Image_2-300x100.png";

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-primary/30 selection:text-primary">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-900 bg-slate-950/80 backdrop-blur-md">
        <div className="container mx-auto max-w-7xl flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={config.appTitle}
              className="h-8 w-auto object-contain brightness-110"
            />
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-primary to-cyan-400">
              {config.appTitle}
            </span>
          </div>

          <nav className="flex items-center gap-4">
            {session ? (
              <Link
                href={session.user.role === "admin" ? "/admin/settings" : "/dashboard"}
                className="rounded-full bg-primary/20 border border-primary/40 px-5 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-white shadow-md transition-all hover:scale-[1.02]"
              >
                Open Workspace
              </Link>
            ) : (
              <Link
                href="/signin"
                className="rounded-full bg-slate-900 border border-slate-800 px-5 py-2 text-sm font-semibold text-slate-200 shadow-md hover:bg-slate-800/80 hover:text-white transition-all hover:scale-[1.02]"
              >
                Sign In
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-20 pb-24 md:pt-28 md:pb-32">
          {/* Subtle background glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] pointer-events-none opacity-30">
            <div className="absolute top-[-10%] left-[20%] w-[35%] h-[60%] rounded-full bg-primary/20 blur-[120px]" />
            <div className="absolute top-[10%] right-[20%] w-[35%] h-[60%] rounded-full bg-cyan-500/10 blur-[120px]" />
          </div>

          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/25 bg-indigo-500/5 px-3.5 py-1.5 text-xs font-medium text-indigo-300 backdrop-blur-sm mb-8">
              <span className="flex h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
              SavazAI Multi-Agent Harness v1.0
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl max-w-4xl mx-auto leading-tight sm:leading-none">
              Orchestrate Autonomous Agents <br className="hidden sm:inline" />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-primary to-cyan-400">
                With Absolute Integrity
              </span>
            </h1>

            <p className="mt-6 text-lg text-slate-400 max-w-3xl mx-auto leading-relaxed">
              Sovereign, privacy-first, multi-model agentic ecosystem. Build, test, and deploy enterprise Agentflows across Frontier and Open-Source LLMs with zero data leakage and total governance.
            </p>

            {/* Value Badges */}
            <div className="mt-8 flex flex-wrap justify-center items-center gap-3 max-w-3xl mx-auto">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/60 px-3.5 py-1 text-xs text-slate-300">
                <Lock className="h-3.5 w-3.5 text-emerald-400" />
                Sovereign & Self-Hosted
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/60 px-3.5 py-1 text-xs text-slate-300">
                <Server className="h-3.5 w-3.5 text-cyan-400" />
                Dynamic MCP Protocol
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/60 px-3.5 py-1 text-xs text-slate-300">
                <PlaySquare className="h-3.5 w-3.5 text-indigo-400" />
                Human-in-the-Loop Planning
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/60 px-3.5 py-1 text-xs text-slate-300">
                <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
                PII Masking & Privacy
              </span>
            </div>

            {/* CTA Buttons - Preserved */}
            <div className="mt-10 flex justify-center items-center">
              <Link
                href="/signin"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-semibold text-white shadow-xl shadow-primary/20 hover:bg-primary/95 transition-all hover:scale-[1.02]"
              >
                Sign In Portal
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </section>

        {/* SHOWCASE SECTION B: Capability Studio & Agentflow Engine */}
        <section className="py-20 border-t border-slate-900/60 bg-slate-950/60 relative">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 mb-4">
                <Workflow className="h-5 w-5" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Visual Agentflow Builder & Runtime Execution Engine
              </h2>
              <p className="mt-4 text-slate-400 leading-relaxed text-sm md:text-base">
                Design pure agent-to-agent graphs, schedule autonomous workflows, and compile to LangGraph pipelines with complete execution control.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="rounded-3xl border border-slate-900 bg-slate-900/20 p-8 hover:border-slate-800 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 mb-5">
                  <Bot className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Role-Based Node Orchestration</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Decoupled node roles: <strong>Supervisor</strong> (Plan formulation & worker routing), <strong>Specialist/Worker</strong> (Tool executions), <strong>Synthesizer</strong> (Receipt aggregation & final reports), and <strong>Scheduled Cron Nodes</strong>.
                </p>
              </div>

              <div className="rounded-3xl border border-slate-900 bg-slate-900/20 p-8 hover:border-slate-800 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 mb-5">
                  <Sliders className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Full Canvas Control</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Interactive drag-and-drop node editing, instant graph duplication, export/import JSON topology definitions, and real-time step-by-step Test Playground trace inspection.
                </p>
              </div>

              <div className="rounded-3xl border border-slate-900 bg-slate-900/20 p-8 hover:border-slate-800 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 mb-5">
                  <PlaySquare className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Dual Execution Strategies</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Seamlessly toggle between <strong>Plan First</strong> (Human-in-the-Loop plan approval cards with Reject, Adjust, or Execute options) and <strong>Direct Execution</strong> (Autonomous fast-path).
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SHOWCASE SECTION C: Business Policy & Library Center */}
        <section className="py-20 border-t border-slate-900/60 bg-slate-950/30">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 mb-4">
                <BookOpen className="h-5 w-5" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Enterprise Operational Knowledge & Governance
              </h2>
              <p className="mt-4 text-slate-400 leading-relaxed text-sm md:text-base">
                Centralize procedural SOPs, business rules, and PII masking policies to ensure agents operate within strict corporate boundaries.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="rounded-3xl border border-slate-900 bg-slate-900/20 p-8 hover:border-slate-800 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 mb-5">
                  <FileCode2 className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Universal Skills Registry</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Import, ingest, and author modular <code>SKILL.md</code> markdown files with YAML frontmatter to equip agents with domain-specific procedural capabilities without code edits.
                </p>
              </div>

              <div className="rounded-3xl border border-slate-900 bg-slate-900/20 p-8 hover:border-slate-800 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 mb-5">
                  <Compass className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">OKF Concepts Matrix</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Operational Knowledge Framework namespaces guide agent reasoning and task context without bloating system prompts or causing token drift.
                </p>
              </div>

              <div className="rounded-3xl border border-slate-900 bg-slate-900/20 p-8 hover:border-slate-800 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-400 mb-5">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Compliance & PII Governance</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Automated Data Masking Gateway replaces PII/SPI fields with unique hashed tokens before sending queries to non-local external LLMs, rehydrating only in protected DB boundaries.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SHOWCASE SECTION D: Command Center & Integrations */}
        <section className="py-20 border-t border-slate-900/60 bg-slate-950/70">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 mb-4">
                <Settings className="h-5 w-5" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Unified Infrastructure Control & System Connectors
              </h2>
              <p className="mt-4 text-slate-400 leading-relaxed text-sm md:text-base">
                Manage branding, model providers, Model Context Protocol (MCP) servers, databases, and social media gateways in a single console.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-6 hover:border-slate-800 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 mb-4">
                  <Sliders className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">Appearance & Branding</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Custom hex CSS token mapping, typography pairings, dynamic app title banners, and theme hydration persisted directly in system configurations.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-6 hover:border-slate-800 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 mb-4">
                  <Cpu className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">LLM Switchboard</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Multi-provider management covering Frontier models (Google Gemini, OpenAI), Open-Source LLMs, Groq, xAI, and OmniRoute local gateway endpoints.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-6 hover:border-slate-800 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 mb-4">
                  <Database className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">MCP & Database Hub</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  1-click preset MCP injection (SAP, JIRA, Salesforce, ServiceNow) and multi-alias external DB connectors (PostgreSQL, MySQL, MongoDB, SQLite).
                </p>
              </div>

              <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-6 hover:border-slate-800 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 mb-4">
                  <Share2 className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">Social Media Hub</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Managed connections for YouTube, Instagram, LinkedIn, TikTok, X (Twitter), and custom REST webhooks for automated content dispatch.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Industry Solutions Section - Preserved */}
        <section className="py-20 bg-slate-950/20 border-t border-slate-900/40">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-white">
                Sovereign AI for Critical Industries
              </h2>
              <p className="mt-4 text-slate-400">
                SavazAI provides a private, secure, and sovereign environment for businesses, individuals, and organizations who must maintain absolute control over their data and AI agents.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Healthcare */}
              <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-6 hover:border-slate-800/80 transition-all duration-300">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-400 mb-4">
                  <Heart className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Healthcare</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  HIPAA-compliant agentflows with automatic PII data masking gateways ensuring patient medical records never leak to external LLM providers.
                </p>
              </div>

              {/* Finance & Banking */}
              <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-6 hover:border-slate-800/80 transition-all duration-300">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-400 mb-4">
                  <DollarSign className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Finance & Banking</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Audit trail execution tracing and strict rule-based orchestrations that enforce financial compliance controls and transaction limits.
                </p>
              </div>

              {/* Insurance */}
              <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-6 hover:border-slate-800/80 transition-all duration-300">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 mb-4">
                  <Building2 className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Insurance</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Automated policy assessment and claim validations with human-in-the-loop approvals for sensitive claims and payout decisions.
                </p>
              </div>

              {/* Legal & Compliance */}
              <div className="rounded-2xl border border-slate-900 bg-slate-900/10 p-6 hover:border-slate-800/80 transition-all duration-300">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 mb-4">
                  <Scale className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Legal & Government</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Strict governance with AGENTS.md blueprints ensuring AI assistants adhere strictly to local statutes, regulatory guidelines, and corporate rules.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Grid - Preserved & Enhanced */}
        <section className="py-20 border-t border-slate-900/60 bg-slate-950/40">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-white">
                Multi-Model Infrastructure & Governance
              </h2>
              <p className="mt-4 text-slate-400">
                SavazAI provides a well-defined, cross-provider governance harness enabling organizations to securely run, audit, and coordinate autonomous agent operations across Gemini, OpenAI, and custom API endpoints.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Tile 1: Data Privacy Gateway */}
              <div className="relative group rounded-3xl border border-slate-900 bg-slate-900/10 p-8 hover:border-slate-800/80 hover:bg-slate-900/20 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 mb-6">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">
                  Data Privacy Gateway
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Sanitize and mask sensitive PII/SPI fields automatically before queries hit non-local external LLM providers. Original data is rehydrated only within protected database boundaries.
                </p>
              </div>

              {/* Tile 2: Dynamic Telemetry & Cost Ledger */}
              <div className="relative group rounded-3xl border border-slate-900 bg-slate-900/10 p-8 hover:border-slate-800/80 hover:bg-slate-900/20 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6">
                  <Layers className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">
                  Dynamic Telemetry & Cost Ledger
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Track model execution metrics, latency, and exact token counts (including reasoning tokens) in real-time. Calculate transaction costs dynamically based on model pricing metadata rules.
                </p>
              </div>

              {/* Tile 3: System Prompt & OKF Matrix */}
              <div className="relative group rounded-3xl border border-slate-900 bg-slate-900/10 p-8 hover:border-slate-800/80 hover:bg-slate-900/20 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 mb-6">
                  <Settings className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">
                  OKF Matrix & System Prompt
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Declare system configuration boundaries and system prompt matrices in the database. Ensure agents behave predictably according to strict corporate rule limits.
                </p>
              </div>

              {/* Tile 4: Plan-Act-Loop Rules */}
              <div className="relative group rounded-3xl border border-slate-900 bg-slate-900/10 p-8 hover:border-slate-800/80 hover:bg-slate-900/20 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400 mb-6">
                  <Workflow className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">
                  Plan-Act-Loop Orchestration
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Define complex, multi-agent orchestrator agentflows using stateful LangGraph structures. Automatically unwrap parallel tool executions and route mutation approvals.
                </p>
              </div>

              {/* Tile 5: Ambient Parameter Injection */}
              <div className="relative group rounded-3xl border border-slate-900 bg-slate-900/10 p-8 hover:border-slate-800/80 hover:bg-slate-900/20 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-500/10 text-green-400 mb-6">
                  <Key className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">
                  Default Ambient Parameters
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Prevent agent blindness and parameter errors on cold turns. Programmatically inject default ambient keys (like `weddingId`) directly from database states into tool call contexts.
                </p>
              </div>

              {/* Tile 6: Blueprint Workspaces & Skills */}
              <div className="relative group rounded-3xl border border-slate-900 bg-slate-900/10 p-8 hover:border-slate-800/80 hover:bg-slate-900/20 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 mb-6">
                  <Cpu className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">
                  Blueprints & Custom Skills
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Support modular Markdown-defined skills and workspace-scoped `AGENTS.md` guidelines. Load, reload, and enforce procedural blueprints dynamically.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Self-Deploy Section - Preserved */}
        <section className="py-20 border-t border-slate-900/60 bg-slate-950/10">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-slate-900 bg-slate-900/5 p-8 md:p-12 backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px] pointer-events-none" />
              
              <div className="text-center max-w-3xl mx-auto mb-12">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 mb-4">
                  <Terminal className="h-6 w-6" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Easy Deployment Agentflow
                </h2>
                <p className="mt-4 text-slate-400 leading-relaxed">
                  SavazAI can be easily deployed in your preferred local or private cloud environment through a streamlined process.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
                {/* Step 1 */}
                <div className="relative group rounded-2xl border border-slate-900 bg-slate-950/40 p-6 hover:border-slate-800/80 transition-all">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold mb-4">
                    1
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Deploy & Launch</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Instantly run the secure multi-agent harness on your preferred local environment or virtual private server (VPS).
                  </p>
                </div>

                {/* Step 2 */}
                <div className="relative group rounded-2xl border border-slate-900 bg-slate-950/40 p-6 hover:border-slate-800/80 transition-all">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold mb-4">
                    2
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Configure Workspace</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Set up your agent rules, default ambient settings, database credentials, and required workspace variables.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="relative group rounded-2xl border border-slate-900 bg-slate-950/40 p-6 hover:border-slate-800/80 transition-all">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold mb-4">
                    3
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Connect & Orchestrate</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Dynamically bind your Model Context Protocol (MCP) servers, custom skills, databases, and LLM providers to run agentflows.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA section - Preserved */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] pointer-events-none opacity-20">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-[100px]" />
          </div>

          <div className="container mx-auto max-w-4xl px-4 text-center relative z-10">
            <div className="rounded-3xl border border-slate-900 bg-slate-950/80 p-12 md:p-16 backdrop-blur-sm">
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
                Need Help with Deployment?
              </h2>
              <p className="mt-4 text-slate-400 text-md max-w-2xl mx-auto leading-relaxed">
                Savazar provides complete deployment and consulting support to tailor the SavazAI Harness to your specific business rules, compliance standards, and custom agent integrations.
              </p>
              
              <div className="mt-10 flex justify-center items-center">
                <a
                  href="https://savazar.com/contact"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-semibold text-white shadow-xl shadow-primary/25 hover:bg-primary/95 transition-all hover:scale-[1.02]"
                >
                  Contact Savazar for Support
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-6 flex justify-center items-center gap-2 text-xs text-slate-500">
                <Mail className="h-3.5 w-3.5" />
                <span>Contact Email: <a href="mailto:info@savazar.com" className="text-slate-400 hover:text-white transition-colors">info@savazar.com</a></span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-8 bg-slate-950">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center text-slate-500 text-xs">
          &copy; {new Date().getFullYear()} {config.appTitle}. All rights reserved. Secure Orchestration Infrastructure.
        </div>
      </footer>
    </div>
  );
}
