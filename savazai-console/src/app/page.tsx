import Link from "next/link";
import { 
  ShieldCheck, 
  Workflow, 
  Terminal, 
  ArrowRight, 
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
  Sparkles,
  Users2,
  CheckCircle2,
  Radio,
  FileText
} from "lucide-react";
import { getSystemConfig } from "@/components/theme-provider";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { RequestDemoTrigger } from "@/components/request-demo-trigger";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function Home() {
  const [config, session] = await Promise.all([
    getSystemConfig(),
    auth.api.getSession({ headers: await headers() }).catch(() => null),
  ]);
  const logoUrl = config.brandLogoUrl || "https://savazar.com/wp-content/uploads/2023/10/cropped-Transparent_Image_2-300x100.png";

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans antialiased selection:bg-primary/30 selection:text-primary">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur-md">
        <div className="container mx-auto max-w-7xl flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={config.appTitle}
              className="h-8 w-auto object-contain brightness-110"
            />
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-primary to-cyan-500">
              {config.appTitle}
            </span>
          </div>

          <nav className="flex items-center gap-3">
            <ThemeToggle compact className="mr-1" />
            {session ? (
              <Link
                href="/dashboard"
                className="rounded-full bg-primary/20 border border-primary/40 px-5 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-primary-foreground shadow-xs transition-all hover:scale-[1.02]"
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
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary backdrop-blur-sm mb-8 shadow-xs">
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
              SavazAI Multi-Agent Harness v1.0
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl max-w-4xl mx-auto leading-tight sm:leading-none">
              <span className="bg-clip-text text-transparent bg-gradient-to-b from-slate-950 via-slate-900 to-slate-700 dark:from-white dark:via-slate-100 dark:to-slate-300">
                Orchestrate Autonomous Agents
              </span>
              <br className="hidden sm:inline" />{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-primary to-cyan-500">
                With Absolute Integrity
              </span>
            </h1>

            <p className="mt-6 text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Sovereign, privacy-first, multi-model agentic ecosystem. Build, test, and deploy enterprise Agentflows across Frontier and Open-Source LLMs with zero data leakage and total governance.
            </p>

            {/* Feature Pills */}
            <div className="mt-8 flex flex-wrap justify-center items-center gap-3 max-w-3xl mx-auto">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1 text-xs text-foreground shadow-xs font-medium">
                <Lock className="h-3.5 w-3.5 text-emerald-500" />
                Sovereign &amp; Self-Hosted
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1 text-xs text-foreground shadow-xs font-medium">
                <Server className="h-3.5 w-3.5 text-cyan-500" />
                Dynamic MCP Protocol
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1 text-xs text-foreground shadow-xs font-medium">
                <PlaySquare className="h-3.5 w-3.5 text-indigo-500" />
                Human-in-the-Loop Planning
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1 text-xs text-foreground shadow-xs font-medium">
                <ShieldCheck className="h-3.5 w-3.5 text-purple-500" />
                PII Masking &amp; Privacy
              </span>
            </div>

            {/* Hero CTAs */}
            <div className="mt-10 flex flex-wrap justify-center items-center gap-4">
              {session ? (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all hover:scale-[1.02]"
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

        {/* Feature Pillar 1: Visual Agentflow Builder & Execution Engine */}
        <section className="py-20 border-t border-border/60 bg-muted/40 relative">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 mb-4">
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
              <div className="rounded-3xl border border-border bg-card p-8 hover:border-primary/40 transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 mb-5">
                  <Bot className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Decoupled Dual-Mode Workspace</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Strictly isolate <strong>Published Agentflows</strong> (compiled LangGraph supervisor planning, specialist team execution, and Plan-First HITL cards) from <strong>Direct MCP Chat</strong> (high-speed conversational tool calling with server-scoped bindings).
                </p>
              </div>

              <div className="rounded-3xl border border-border bg-card p-8 hover:border-primary/40 transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500 mb-5">
                  <Users2 className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Capability Studio with Resizable Teams</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Compose modular <code>TeamNode</code> containers with live interactive resize handles, collapsible agent blocks, and orthogonal bus routing edges adapted for both light and dark backgrounds.
                </p>
              </div>

              <div className="rounded-3xl border border-border bg-card p-8 hover:border-primary/40 transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 mb-5">
                  <PlaySquare className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Plan-First Human-in-the-Loop Execution</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Eliminates technical UUID prompts from workflows. Intelligent runtime auto-resolution dynamically injects foreign keys and workspace context, surfacing clear step breakdowns and parameter cards.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Pillar 2: Universal Model Context Protocol (MCP) Gateway */}
        <section className="py-20 border-t border-border/60 bg-background relative">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500 mb-4">
                <Server className="h-5 w-5" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Universal Model Context Protocol (MCP) Gateway
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed text-sm md:text-base">
                Connect external enterprise services, financial tools, and corporate systems dynamically over registered JSON-RPC 2.0 endpoints.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="rounded-3xl border border-border bg-card p-8 hover:border-cyan-500/40 transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500 mb-5">
                  <Radio className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Multi-Transport Protocol Engine</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Real-time tool discovery across <code>streamable-http</code>, <code>sse</code>, and <code>stdio</code> transports. Live dynamic discovery connects seamlessly with real-world public and private servers like NSE India Bhavcopy.
                </p>
              </div>

              <div className="rounded-3xl border border-border bg-card p-8 hover:border-cyan-500/40 transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 mb-5">
                  <Database className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Live Tool Schema Hydration</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Dynamic parameter hydration without static code bindings. Required input schemas are inspected at runtime to auto-populate forms and validate worker function executions.
                </p>
              </div>

              <div className="rounded-3xl border border-border bg-card p-8 hover:border-cyan-500/40 transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 mb-5">
                  <SlidersVertical className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Server-Scoped Workspace Exposure</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Selective <code>workspaceEnabled</code> isolation shields internal specialist tools from consumer chat while granting authorized conversational tools direct workspace availability.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Pillar 3: Enterprise Zero-Trust Security & RBAC */}
        <section className="py-20 border-t border-border/60 bg-muted/40 relative">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 mb-4">
                <Lock className="h-5 w-5" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Enterprise Zero-Trust Security &amp; RBAC Architecture
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed text-sm md:text-base">
                Multi-layered perimeter security, role-based access control, cryptographic onboarding, and AES-256 encrypted credential protection.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="rounded-3xl border border-border bg-card p-8 hover:border-emerald-500/40 transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 mb-5">
                  <Key className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">53-Permission RBAC Matrix</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  6 predefined system access profiles (Super Admin, Studio Architect, Workspace Operator, Policy Manager, Infra Lead, Auditor) plus custom enterprise role composition across 7 functional categories.
                </p>
              </div>

              <div className="rounded-3xl border border-border bg-card p-8 hover:border-emerald-500/40 transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 mb-5">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Cryptographic Tokenized Onboarding</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Zero open registration. New operators join strictly via single-use, time-limited SHA-256 invitation tokens. New accounts are quarantined in pending approval until assigned an administrative profile.
                </p>
              </div>

              <div className="rounded-3xl border border-border bg-card p-8 hover:border-emerald-500/40 transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500 mb-5">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Perimeter Defense &amp; PII DLP</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Integrated Cloudflare Turnstile anti-bot defense, unforgeable client IP extraction, and automated regex Data Masking Gateways that replace sensitive PII tokens prior to LLM query dispatch.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Pillar 4: Business Policy & Knowledge Framework */}
        <section className="py-20 border-t border-border/60 bg-background relative">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 mb-4">
                <Compass className="h-5 w-5" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Business Policy &amp; Knowledge Framework (OKF)
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed text-sm md:text-base">
                Centralize procedural SOPs, business rules, and compliance policies to ground agent intelligence without bloating context windows.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="rounded-3xl border border-border bg-card p-8 hover:border-purple-500/40 transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 mb-5">
                  <FileCode className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Universal Skills Registry</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Import, author, and bind domain-specific procedural skills (<code>SKILL.md</code>) across workers to execute standardized business guidelines without altering runtime core logic.
                </p>
              </div>

              <div className="rounded-3xl border border-border bg-card p-8 hover:border-purple-500/40 transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500 mb-5">
                  <Compass className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">OKF Concepts Matrix</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Namespace-isolated Operational Knowledge Framework records inject verified business terms and ontological rules into agent execution trees with zero token drift.
                </p>
              </div>

              <div className="rounded-3xl border border-border bg-card p-8 hover:border-purple-500/40 transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 mb-5">
                  <FileText className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Audit Trails &amp; Compliance</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Ground-truth execution receipts, state audit histories, and compliance logs allow auditors to review every specialist operation and plan resumption in real time.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Infrastructure & System Connectors Section */}
        <section className="py-20 border-t border-border/60 bg-muted/40">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 mb-4">
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
              <div className="rounded-2xl border border-border bg-card p-6 hover:border-border transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 mb-4">
                  <SlidersVertical className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-2">Appearance &amp; Branding</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Custom color token mapping, typography pairings, dynamic app title banners, and theme hydration persisted directly in system configurations.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 hover:border-border transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500 mb-4">
                  <Cpu className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-2">LLM Switchboard</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Multi-provider management covering Frontier models (Google Gemini, Anthropic Claude, OpenAI), Open-Source LLMs, Groq, xAI, and local gateway endpoints.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 hover:border-border transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 mb-4">
                  <Database className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-2">MCP &amp; Database Hub</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  1-click preset tool injection (SAP, JIRA, Salesforce, ServiceNow) and multi-alias external DB connectors (PostgreSQL, MySQL, MongoDB, SQLite).
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 hover:border-border transition-all shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 mb-4">
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
        <section className="py-20 bg-background border-t border-border/40">
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
              <div className="rounded-2xl border border-border bg-card p-6 hover:border-border transition-all duration-300 shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 mb-4">
                  <Heart className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Healthcare</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  HIPAA-compliant agentflows with automatic PII data masking gateways ensuring patient medical records never leak to external LLM providers.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 hover:border-border transition-all duration-300 shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 mb-4">
                  <DollarSign className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Finance &amp; Banking</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Audit trail execution tracing and strict rule-based orchestrations that enforce financial compliance controls and transaction limits.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 hover:border-border transition-all duration-300 shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500 mb-4">
                  <Building2 className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Insurance</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Automated policy assessment and claim validations with human-in-the-loop approvals for sensitive claims and payout decisions.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 hover:border-border transition-all duration-300 shadow-xs">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 mb-4">
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

        {/* 3-Step Deployment Section */}
        <section className="py-20 border-t border-border/60 bg-muted/40">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-border bg-card p-8 md:p-12 backdrop-blur-sm relative overflow-hidden shadow-xs">
              <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px] pointer-events-none" />

              <div className="text-center max-w-3xl mx-auto mb-12">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500 mb-4">
                  <Terminal className="h-6 w-6" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Streamlined Deployment Workflow
                </h2>
                <p className="mt-4 text-muted-foreground leading-relaxed">
                  SavazAI deploys effortlessly in your preferred local Docker environment or sovereign private cloud infrastructure.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
                <div className="relative group rounded-2xl border border-border bg-muted/30 p-6 hover:border-border transition-all">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold mb-4">
                    1
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">Deploy &amp; Launch</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Instantly run the secure multi-agent harness on your preferred local environment or private cloud infrastructure.
                  </p>
                </div>

                <div className="relative group rounded-2xl border border-border bg-muted/30 p-6 hover:border-border transition-all">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold mb-4">
                    2
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">Configure Workspace</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Set up your agent rules, default ambient settings, database credentials, and required workspace variables.
                  </p>
                </div>

                <div className="relative group rounded-2xl border border-border bg-muted/30 p-6 hover:border-border transition-all">
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
        <section className="py-24 relative overflow-hidden bg-background">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] pointer-events-none opacity-20">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-[100px]" />
          </div>

          <div className="container mx-auto max-w-4xl px-4 text-center relative z-10">
            <div className="rounded-3xl border border-border bg-card p-12 md:p-16 backdrop-blur-sm shadow-sm">
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
              <div className="mt-10 flex flex-wrap justify-center items-center gap-4">
                {session ? (
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all hover:scale-[1.02]"
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
      <footer className="border-t border-border py-8 bg-card">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-muted-foreground text-xs">
          <div>
            &copy; 2026 {config.appTitle}. All rights reserved. Sovereign Multi-Agent Orchestration Infrastructure.
          </div>
          <div className="flex items-center gap-6">
            <RequestDemoTrigger variant="header" />
          </div>
        </div>
      </footer>
    </div>
  );
}
