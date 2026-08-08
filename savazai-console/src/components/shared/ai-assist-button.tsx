"use client";

import React, { useState } from "react";
import { Sparkles, Loader2, WandSparkles, FileText, Brush, AlignLeft, X, CheckCircle2, XCircle } from "lucide-react";

interface AiAssistButtonProps {
  onGenerated: (text: string) => void;
  mode?: "generate" | "enhance" | "summarize" | "all";
  placeholder?: string;
  domain?: "system-prompt" | "skill" | "okf-guideline";
}

type AssistMode = "generate" | "enhance" | "summarize";

const DOMAIN_PROMPTS: Record<string, string> = {
  "system-prompt": "You are a system prompt engineering assistant. Generate a structured agent system prompt with the following sections using the topic or description provided. Use ## for section headers.\n"
    + "## Role & Goal — Define the agent's identity, primary mission, and scope.\n"
    + "## Operational Boundaries — List constraints, tools the agent has, what it must never do, and escalation rules.\n"
    + "## Execution Rules — Output format rules, chain-of-thought requirements, fallback behavior, and error handling.\n"
    + "Return ONLY the formatted system prompt. No meta-commentary, no code fences.",
  "skill": "You are a SKILL.md authoring assistant. Generate a complete skill definition in SKILL.md format with YAML frontmatter followed by Markdown sections for the topic provided.\n"
    + "---\n"
    + "name: skill_name\n"
    + "description: One-line summary\n"
    + "---\n"
    + "## Description — What this skill does in detail.\n"
    + "## Parameters — Input parameters the skill accepts (name, type, description).\n"
    + "## Logic — Step-by-step execution logic the agent follows when invoking this skill.\n"
    + "Return ONLY the raw SKILL.md content. No meta-commentary, no code fences.",
  "okf-guideline": "You are an OKF concept authoring assistant. Generate a structured OKF concept bundle with the following sections for the topic provided.\n"
    + "## Overview — What this concept covers, its purpose, and the problem it solves.\n"
    + "## Governance Rules — The rules, policies, or standards that must be followed.\n"
    + "## Compliance Scope — Which entities, systems, or workflows this applies to and any exceptions.\n"
    + "Return ONLY the formatted Markdown content. No meta-commentary, no code fences.",
};

const MODE_LABELS: Record<AssistMode, { icon: React.FC<{ className?: string }>; label: string; genericPrompt: string }> = {
  generate: { icon: FileText, label: "Generate Draft", genericPrompt: "Generate a complete, well-structured draft for the following topic or specification. Return ONLY the generated content without meta-commentary." },
  enhance: { icon: Brush, label: "Enhance / Polish", genericPrompt: "Review and enhance the following text. Improve clarity, professionalism, and completeness. Fix grammar and style issues. Return ONLY the enhanced text without meta-commentary." },
  summarize: { icon: AlignLeft, label: "Summarize", genericPrompt: "Summarize the following text concisely while preserving all key information. Return ONLY the summary without meta-commentary." },
};

export function AiAssistButton({ onGenerated, mode = "all", placeholder, domain }: AiAssistButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<AssistMode>("generate");
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const domainLabel = domain
    ? ({ "system-prompt": "System Prompt", "skill": "SKILL.md", "okf-guideline": "OKF Guidelines" }[domain])
    : null;

  const resolvedPlaceholder = placeholder || (domain
    ? ({ "system-prompt": "Describe the agent role, goals, and constraints...", "skill": "Describe the skill capability and behavior...", "okf-guideline": "Describe the policy, rules, or compliance scope..." }[domain])
    : "Describe what you want to generate...");

  const availableModes = mode === "all"
    ? (["generate", "enhance", "summarize"] as AssistMode[])
    : [mode as AssistMode];

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setGenerating(true);
    setError(null);
    setResult(null);

    const modeInfo = MODE_LABELS[activeMode];
    const domainPrompt = domain ? DOMAIN_PROMPTS[domain] : modeInfo.genericPrompt;
    const prompt = `${domainPrompt}\n\n${input.trim()}`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
        }),
      });

      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        let fullText = "";
        if (contentType.includes("event-stream") && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunkStr = decoder.decode(value);
            const lines = chunkStr.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed.content) fullText += parsed.content;
                  else if (parsed.response) fullText += parsed.response;
                  else if (parsed.delta) fullText += parsed.delta;
                } catch {
                  fullText += line.slice(6);
                }
              }
            }
          }
        } else {
          const data = await res.json();
          fullText = data.response || data.content || data.message || "";
        }
        const cleaned = fullText.replace(/^```[\s\S]*?\n/, "").replace(/\n```$/, "").trim();
        setResult(cleaned || fullText.trim());
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || errData.message || "Failed to generate content.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = () => {
    if (result) {
      onGenerated(result);
      setModalOpen(false);
      setInput("");
      setResult(null);
      setError(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        title="AI Assist"
        className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg border border-violet-500/30 bg-violet-600/10 hover:bg-violet-600/20 text-violet-400 hover:text-violet-300 text-[9px] font-bold transition-all shrink-0"
      >
        <Sparkles className="h-3 w-3" />
        AI
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setModalOpen(false); setInput(""); setResult(null); setError(null); }} />
          <div className="relative bg-[#0a0a14] border border-slate-800 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            <button
              type="button"
              onClick={() => { setModalOpen(false); setInput(""); setResult(null); setError(null); }}
              className="absolute top-4 right-4 text-slate-600 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
                <WandSparkles className="h-4 w-4 text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">AI Assistant{domainLabel ? ` — ${domainLabel}` : ""}</h3>
                <p className="text-[10px] text-slate-500">Generate, enhance, or summarize content using AI</p>
              </div>
            </div>

            {availableModes.length > 1 && (
              <div className="flex gap-1.5 mb-4 flex-wrap">
                {availableModes.map((m) => {
                  const Icon = MODE_LABELS[m].icon;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setActiveMode(m); setResult(null); setError(null); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                        activeMode === m
                          ? "bg-violet-600/20 border border-violet-500/40 text-violet-300"
                          : "bg-slate-900/30 border border-slate-800 text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      {MODE_LABELS[m].label}
                    </button>
                  );
                })}
              </div>
            )}

            {domain && (
              <div className="mb-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-2.5">
                <p className="text-[9px] text-indigo-300 font-semibold leading-relaxed">
                  The AI will generate structured content with sections for your domain.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  {activeMode === "generate" ? "Topic / Description" : activeMode === "enhance" ? "Text to Enhance" : "Text to Summarize"}
                </label>
                <textarea
                  rows={5}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={resolvedPlaceholder}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 px-3 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500 resize-none font-mono"
                />
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={!input.trim() || generating}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
              >
                {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><Sparkles className="h-4 w-4" /> {MODE_LABELS[activeMode].label}</>}
              </button>

              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-400">
                  <XCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}

              {result && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-400 uppercase">Generated Content</span>
                  </div>
                  <pre className="text-[10px] text-slate-300 font-mono bg-slate-900/50 px-2 py-1.5 rounded-lg border border-slate-800 max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                    {result}
                  </pre>
                  <button
                    type="button"
                    onClick={handleApply}
                    className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all"
                  >
                    Apply to Field
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
