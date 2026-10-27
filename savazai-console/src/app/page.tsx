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
  SlidersVertical,
  PlaySquare,
  Compass,
  Server,
  Lock,
  Database,
  Share2,
  FileCode,
  Sparkles
} from "lucide-react";
import { getSystemConfig } from "@/components/theme-provider";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { RequestDemoTrigger } from "@/components/request-demo-trigger";

export default async function Home() {
  const [config, session] = await Promise.all([
    getSystemConfig(),
    auth.api.getSession({ headers: await headers() }).catch(() => null),
  ]);
  const logoUrl = config.brandLogoUrl || "https://savazar.com/wp-content/uploads/2023/10/cropped-Transparent_Image_2-300x100.png";

  return (
    <div className="flex flex-col min-h-screen bg-background text-slate-100 font-sans antialiased selection:bg-primary/30 selection:text-primary">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-muted/40 backdrop-blur-md">
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
                href={session.user.role === "admin" ? "/admin/settings" : "/studio"}
                className="rounded-full bg-primary/20 border border-primary/40 px-5 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-foreground shadow-md transition-all hover:scale-[1.02]"
              >
                Open Workspace
              </Link>
            ) : (
              <RequestDemoTrigger variant="header" />
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

            <p className="mt-6 text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Sovereign, privacy-first, multi-model agentic ecosystem. Build, test, and deploy enterprise Agentflows across Frontier and Open-Source LLMs with zero data leakage and total governance.
            </p>

            {/* Feature Pills */}
            <div className="mt-8 flex flex-wrap justify-center items-center gap-3 max-w-3xl mx-auto">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3.5 py-1 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5 text-emerald-400" />
                Sovereign &amp; Self-Hosted
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3.5 py-1 text-xs text-muted-foreground">
                <Server className="h-3.5 w-3.5 text-cyan-400" />
                Dynamic MCP Protocol
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3.5 py-1 text-xs text-muted-foreground">
                <PlaySquare className="h-3.5 w-3.5 text-indigo-400" />
                Human-in-the-Loop Planning
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3.5 py-1 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
                PII Masking &amp; Privacy
              </span>
            </div>

            {/* Single Primary CTA */}
            <div className="mt-10 flex justify-center items-center">
              {session ? (
                <Link
                  href={session.user.role === "admin" ? "/admin/settings" : "/studio"}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-semibold text-foreground shadow-xl shadow-primary/20 hover:bg-primary/95 transition-all hover:scale-[1.02]"
                >
                  Open Workspace
                  <ArrowRight className="h-5 w-5" />
                </Link>
              ) : (
                <RequestDemoTrigger variant="hero" />
              )}
            </div>
          </div>
        </section>

        {/* Visual Agentflow Section */}
        <section className="py-20 border-t border-border/60 bg-muted/40 relative">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 mb-4">
                <Workflow className="h-5 w-5" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Visual Agentflow Builder &amp; Runtime Execution Engine
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed text-sm md:text-base">
                Design pure agent-to-agent graphs, schedule autonomous workflows, and compile deterministic multi-agent pipelines with complete execution control.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="rounded-3xl border border-border bg-muted/30 p-8 hover:border-border transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 mb-5">
                  <Bot className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Decoupled Dual-Mode Agent Workspace</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Strictly isolate <strong>Published Agentflows</strong> (compiled LangGraph supervisor planning, specialist team execution, and Plan-First HITL cards) from <strong>Direct MCP Chat</strong> (high-speed conversational tool calling with server-scoped bindings).
                </p>
              </div>

              <div className="rounded-3xl border border-border bg-muted/30 p-8 hover:border-border transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 mb-5">
                  <Server className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Universal Dynamic MCP Transports</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Real-time tool discovery across <code>streamable-http</code>, <code>sse</code>, and <code>stdio</code> transports. Live granular schema hydration with resilient multi-tier fallbacks and granular <code>workspaceEnabled</code> visibility switches.
                </p>
              </div>

              <div className="rounded-3xl border border-border bg-muted/30 p-8 hover:border-border transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 mb-5">
                  <PlaySquare className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Automated Technical Context Resolution</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Eliminates technical UUID prompts from Human-in-the-Loop workflows. Intelligent runtime auto-resolution dynamically injects foreign keys and workspace context from active sessions and getter tools.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Enterprise Knowledge & Governance Section */}
        <section className="py-20 border-t border-border/60 bg-muted/40">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 mb-4">
                <Compass className="h-5 w-5" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Enterprise Operational Knowledge &amp; Governance
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed text-sm md:text-base">
                Centralize procedural SOPs, business rules, and PII masking policies to ensure agents operate within strict corporate boundaries.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="rounded-3xl border border-border bg-muted/30 p-8 hover:border-border transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 mb-5">
                  <FileCode className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Universal Skills Registry</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Import, ingest, and author modular skill definitions to equip agents with domain-specific procedural capabilities without modifying application code.
                </p>
              </div>

              <div className="rounded-3xl border border-border bg-muted/30 p-8 hover:border-border transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 mb-5">
                  <Compass className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">OKF Concepts Matrix</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Operational Knowledge Framework namespaces guide agent reasoning and task context without bloating system prompts or causing token drift.
                </p>
              </div>

              <div className="rounded-3xl border border-border bg-muted/30 p-8 hover:border-border transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-400 mb-5">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Compliance &amp; PII Governance</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Automated Data Masking Gateway replaces sensitive personal fields with unique placeholder tokens before sending queries to external LLMs, protecting enterprise privacy.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Infrastructure & System Connectors Section */}
        <section className="py-20 border-t border-border/60 bg-muted/40">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 mb-4">
                <Settings className="h-5 w-5" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Unified Infrastructure Control &amp; System Connectors
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed text-sm md:text-base">
                Manage branding, model providers, Model Context Protocol (MCP) servers, databases, and social media gateways in a single console.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="rounded-2xl border border-border bg-muted/30 p-6 hover:border-border transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 mb-4">
                  <SlidersVertical className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-2">Appearance &amp; Branding</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Custom color token mapping, typography pairings, dynamic app title banners, and theme hydration persisted directly in system configurations.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-6 hover:border-border transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 mb-4">
                  <Cpu className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-2">LLM Switchboard</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Multi-provider management covering Frontier models (Google Gemini, Anthropic Claude, OpenAI), Open-Source LLMs, Groq, xAI, and local gateway endpoints.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-6 hover:border-border transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 mb-4">
                  <Database className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-2">MCP &amp; Database Hub</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  1-click preset tool injection (SAP, JIRA, Salesforce, ServiceNow) and multi-alias external DB connectors (PostgreSQL, MySQL, MongoDB, SQLite).
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-6 hover:border-border transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 mb-4">
                  <Share2 className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-2">Social Media Hub</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Managed connections for YouTube, Instagram, LinkedIn, TikTok, X (Twitter), and custom REST webhooks for automated content dispatch.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Industry Solutions Section */}
        <section className="py-20 bg-muted/40 border-t border-border/40">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
                Sovereign AI for Critical Industries
              </h2>
              <p className="mt-4 text-muted-foreground">
                SavazAI provides a private, secure, and sovereign environment for businesses, individuals, and organizations who must maintain absolute control over their data and AI agents.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="rounded-2xl border border-border bg-muted/30 p-6 hover:border-border transition-all duration-300">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-400 mb-4">
                  <Heart className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Healthcare</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  HIPAA-compliant agentflows with automatic PII data masking gateways ensuring patient medical records never leak to external LLM providers.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-6 hover:border-border transition-all duration-300">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-400 mb-4">
                  <DollarSign className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Finance &amp; Banking</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Audit trail execution tracing and strict rule-based orchestrations that enforce financial compliance controls and transaction limits.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-6 hover:border-border transition-all duration-300">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 mb-4">
                  <Building2 className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Insurance</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Automated policy assessment and claim validations with human-in-the-loop approvals for sensitive claims and payout decisions.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-6 hover:border-border transition-all duration-300">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 mb-4">
                  <Scale className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Legal &amp; Government</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Strict governance blueprints ensuring AI assistants adhere strictly to local statutes, regulatory guidelines, and corporate rules.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Multi-Model Infrastructure & Governance 6-Grid */}
        <section className="py-20 border-t border-border/60 bg-muted/40">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
                Multi-Model Infrastructure &amp; Governance
              </h2>
              <p className="mt-4 text-muted-foreground">
                SavazAI provides a well-defined, cross-provider governance harness enabling organizations to securely run, audit, and coordinate autonomous agent operations across Gemini, Claude, OpenAI, and custom API endpoints.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="relative group rounded-3xl border border-border bg-muted/30 p-8 hover:border-border hover:bg-muted/30 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 mb-6">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">Data Privacy Gateway</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Sanitize and mask sensitive personal data fields automatically before queries reach external LLM providers, ensuring total enterprise confidentiality.
                </p>
              </div>

              <div className="relative group rounded-3xl border border-border bg-muted/30 p-8 hover:border-border hover:bg-muted/30 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6">
                  <Layers className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">Dynamic Telemetry &amp; Cost Ledger</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Track model execution metrics, latency, and exact token counts in real-time. Calculate transaction costs dynamically based on model pricing rules.
                </p>
              </div>

              <div className="relative group rounded-3xl border border-border bg-muted/30 p-8 hover:border-border hover:bg-muted/30 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 mb-6">
                  <Settings className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">OKF Matrix &amp; System Governance</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Declare system configuration boundaries and prompt matrices in the database. Ensure agents behave predictably according to strict corporate rule limits.
                </p>
              </div>

              <div className="relative group rounded-3xl border border-border bg-muted/30 p-8 hover:border-border hover:bg-muted/30 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400 mb-6">
                  <Workflow className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">Plan-Act-Loop Orchestration</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Define complex, multi-agent orchestrations with deterministic state handling. Automatically coordinate tool executions and route human approval checkpoints.
                </p>
              </div>

              <div className="relative group rounded-3xl border border-border bg-muted/30 p-8 hover:border-border hover:bg-muted/30 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-500/10 text-green-400 mb-6">
                  <Key className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">Default Ambient Parameters</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Prevent agent context blindspots and parameter errors by programmatically injecting ambient workspace keys directly from database state into tool execution contexts.
                </p>
              </div>

              <div className="relative group rounded-3xl border border-border bg-muted/30 p-8 hover:border-border hover:bg-muted/30 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 mb-6">
                  <Cpu className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">Blueprints &amp; Custom Skills</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Support modular, markdown-defined skills and workspace guidelines. Load, customize, and enforce procedural blueprints dynamically across agent teams.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 3-Step Deployment Section */}
        <section className="py-20 border-t border-border/60 bg-muted/40">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-border bg-muted/30 p-8 md:p-12 backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px] pointer-events-none" />

              <div className="text-center max-w-3xl mx-auto mb-12">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 mb-4">
                  <Terminal className="h-6 w-6" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Easy Deployment Agentflow
                </h2>
                <p className="mt-4 text-muted-foreground leading-relaxed">
                  SavazAI can be easily deployed in your preferred local or private cloud environment through a streamlined process.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
                <div className="relative group rounded-2xl border border-border bg-muted/40 p-6 hover:border-border transition-all">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold mb-4">
                    1
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">Deploy &amp; Launch</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Instantly run the secure multi-agent harness on your preferred local environment or private cloud infrastructure.
                  </p>
                </div>

                <div className="relative group rounded-2xl border border-border bg-muted/40 p-6 hover:border-border transition-all">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold mb-4">
                    2
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">Configure Workspace</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Set up your agent rules, default ambient settings, database credentials, and required workspace variables.
                  </p>
                </div>

                <div className="relative group rounded-2xl border border-border bg-muted/40 p-6 hover:border-border transition-all">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold mb-4">
                    3
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">Connect &amp; Orchestrate</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Dynamically bind your tool servers, custom skills, databases, and LLM providers to execute automated workflows.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Enterprise Conversion CTA Section */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] pointer-events-none opacity-20">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-[100px]" />
          </div>

          <div className="container mx-auto max-w-4xl px-4 text-center relative z-10">
            <div className="rounded-3xl border border-border bg-muted/40 p-12 md:p-16 backdrop-blur-sm">
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-4">
                <Sparkles className="h-3.5 w-3.5" />
                Enterprise Multi-Agent Platform
              </div>
              <h2 className="text-3xl font-extrabold text-foreground sm:text-4xl">
                Ready to Transform Your Enterprise with Sovereign AI?
              </h2>
              <p className="mt-4 text-muted-foreground text-md max-w-2xl mx-auto leading-relaxed">
                Discover how deterministic multi-agent workflows, automated PII protection, and organizational knowledge grounding automate complex business procedures with absolute integrity.
              </p>
              <div className="mt-10 flex justify-center items-center">
                {session ? (
                  <Link
                    href={session.user.role === "admin" ? "/admin/settings" : "/studio"}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-semibold text-foreground shadow-xl shadow-primary/20 hover:bg-primary/95 transition-all hover:scale-[1.02]"
                  >
                    Open Workspace
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                ) : (
                  <RequestDemoTrigger variant="hero" />
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 bg-background">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center text-muted-foreground text-xs">
          &copy; 2026 {config.appTitle}. All rights reserved. Secure Orchestration Infrastructure.
        </div>
      </footer>
    </div>
  );
}
