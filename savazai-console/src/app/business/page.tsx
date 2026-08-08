"use client";

import React, { useState } from "react";
import { SkillsRegistry } from "@/components/business/skills-registry";
import { OkfRegistry } from "@/components/business/okf-registry";
import { ComplianceManager } from "@/components/business/compliance-manager";
import { Wrench, BookOpen, ShieldCheck } from "lucide-react";

export default function BusinessCenterPage() {
  const [subTab, setSubTab] = useState<"skills" | "okf" | "governance">("skills");

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 p-6">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-900 pb-5 mb-6">
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Business Policy &amp; Library Center</h1>
        <p className="text-slate-500 text-xs mt-1">Manage global enterprise rules, custom agent skills, and OKF guidelines namespaces</p>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex flex-row min-h-0 gap-6">
        {/* Left vertical navigation menu */}
        <div className="w-64 shrink-0 flex flex-col space-y-1.5 border-r border-slate-900 pr-6">
          <button
            type="button"
            onClick={() => setSubTab("skills")}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all text-left ${
              subTab === "skills"
                ? "bg-indigo-600/10 border border-indigo-500/30 text-white font-bold"
                : "border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
            }`}
          >
            <Wrench className={`h-4 w-4 ${subTab === "skills" ? "text-indigo-400" : "text-slate-500"}`} />
            Universal Skills Registry
          </button>

          <button
            type="button"
            onClick={() => setSubTab("okf")}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all text-left ${
              subTab === "okf"
                ? "bg-indigo-600/10 border border-indigo-500/30 text-white font-bold"
                : "border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
            }`}
          >
            <BookOpen className={`h-4 w-4 ${subTab === "okf" ? "text-indigo-400" : "text-slate-500"}`} />
            Google OKF Concepts
          </button>

          <button
            type="button"
            onClick={() => setSubTab("governance")}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all text-left ${
              subTab === "governance"
                ? "bg-indigo-600/10 border border-indigo-500/30 text-white font-bold"
                : "border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
            }`}
          >
            <ShieldCheck className={`h-4 w-4 ${subTab === "governance" ? "text-indigo-400" : "text-slate-500"}`} />
            Compliance &amp; PII Rules
          </button>
        </div>

        {/* Right dedicated workspace */}
        <div className="flex-1 min-h-0 bg-slate-950/40 rounded-2xl overflow-hidden">
          {subTab === "skills" && <SkillsRegistry />}
          {subTab === "okf" && <OkfRegistry />}
          {subTab === "governance" && <ComplianceManager />}
        </div>
      </div>
    </div>
  );
}
