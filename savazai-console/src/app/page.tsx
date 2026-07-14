import Link from "next/link";
import { ShieldCheck, Workflow, Activity, Terminal, ArrowRight, ExternalLink, Mail } from "lucide-react";
import { getSystemConfig } from "@/components/theme-provider";

export default async function Home() {
  const config = await getSystemConfig();
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
            <Link
              href="/signin"
              className="rounded-full bg-slate-900 border border-slate-800 px-5 py-2 text-sm font-semibold text-slate-200 shadow-md hover:bg-slate-800/80 hover:text-white transition-all hover:scale-[1.02]"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden pt-20 pb-24 md:pt-32">
          {/* Subtle background glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] pointer-events-none opacity-30">
            <div className="absolute top-[-10%] left-[20%] w-[35%] h-[60%] rounded-full bg-primary/20 blur-[120px]" />
            <div className="absolute top-[10%] right-[20%] w-[35%] h-[60%] rounded-full bg-cyan-500/10 blur-[120px]" />
          </div>

          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/25 bg-indigo-500/5 px-3 py-1 text-xs text-indigo-300 backdrop-blur-sm mb-6">
              <span className="flex h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
              SavazAI Multi-Agent Harness v1.0
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl max-w-4xl mx-auto leading-tight sm:leading-none">
              Orchestrate Autonomous Agents <br className="hidden sm:inline" />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-primary to-cyan-400">
                With Absolute Integrity
              </span>
            </h1>

            <p className="mt-6 text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Empower your enterprise with structured LangGraph loops, deterministic data privacy gateways, and proactive schema discovery. Stream states in real-time with zero latency.
            </p>

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

        {/* Feature Grid */}
        <section className="py-20 border-t border-slate-900/60 bg-slate-950/40">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-white">
                Engineered for High-Security Environments
              </h2>
              <p className="mt-4 text-slate-400">
                All agent execution traces, PII sanitization, and streaming data layers are fully controlled, audited, and deterministic.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Feature 1 */}
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

              {/* Feature 2 */}
              <div className="relative group rounded-3xl border border-slate-900 bg-slate-900/10 p-8 hover:border-slate-800/80 hover:bg-slate-900/20 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6">
                  <Workflow className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">
                  LangGraph Supervisor Node
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Manage agent-to-tool routing loops deterministically. Proactive schema discovery injects available MCP endpoints automatically on session start to prevent first-turn blindness.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="relative group rounded-3xl border border-slate-900 bg-slate-900/10 p-8 hover:border-slate-800/80 hover:bg-slate-900/20 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 mb-6">
                  <Activity className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">
                  Streamable NDJSON Engine
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Real-time node execution telemetry streamed straight to the console client. Standalone brackets and routing decision tokens are scrubbed automatically to ensure clean text output.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Self-Deploy Section */}
        <section className="py-20 border-t border-slate-900/60 bg-slate-950/10">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-slate-900 bg-slate-900/5 p-8 md:p-12 backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px] pointer-events-none" />
              
              <div className="text-center max-w-3xl mx-auto mb-12">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 mb-4">
                  <Terminal className="h-6 w-6" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Easy Deployment Workflow
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
                  <h3 className="text-lg font-bold text-white mb-2">Configure Workspace</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Set up your agent rules, system configurations, and required variables to match your business domains.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="relative group rounded-2xl border border-slate-900 bg-slate-950/40 p-6 hover:border-slate-800/80 transition-all">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold mb-4">
                    2
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Connect Integrations</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Dynamically bind your database schemas, MCP servers, external API connections, and LLM providers.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="relative group rounded-2xl border border-slate-900 bg-slate-950/40 p-6 hover:border-slate-800/80 transition-all">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold mb-4">
                    3
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Launch Console</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Instantly run the secure management portal to orchestrate multi-agent loops and inspect trace telemetries.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA section */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] pointer-events-none opacity-20">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-[100px]" />
          </div>

          <div className="container mx-auto max-w-4xl px-4 text-center relative z-10">
            <div className="rounded-3xl border border-slate-900 bg-slate-950/80 p-12 md:p-16 backdrop-blur-sm">
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
                Need Help with Enterprise Deployment?
              </h2>
              <p className="mt-4 text-slate-400 text-md max-w-2xl mx-auto leading-relaxed">
                Savazar provides complete deployment and consulting support to tailor the SavazAI Harness to your specific business rules, compliance standards, and custom agent integrations.
              </p>
              
              <div className="mt-10 flex flex-col sm:flex-row justify-center items-center gap-4">
                <Link
                  href="/signin"
                  className="rounded-full bg-primary px-8 py-4 text-base font-semibold text-white shadow-xl shadow-primary/25 hover:bg-primary/95 transition-all hover:scale-[1.02]"
                >
                  Sign In Portal
                </Link>
                <a
                  href="https://savazar.com/contact"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 px-8 py-4 text-base font-semibold text-slate-300 hover:text-white transition-all backdrop-blur-sm"
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
