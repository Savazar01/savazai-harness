"use client";

import React, { useState, useEffect } from "react";
import { SkillsRegistry } from "@/components/business/skills-registry";
import { OkfRegistry } from "@/components/business/okf-registry";
import { ComplianceManager } from "@/components/business/compliance-manager";
import { Wrench, BookOpen, ShieldCheck, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePermissions } from "@/lib/auth/use-permissions";

export default function BusinessCenterPage() {
  const { hasPermission } = usePermissions();
  const canViewSkills = hasPermission("business_center", "skills_view");
  const canViewOkf = hasPermission("business_center", "okf_view");
  const canViewCompliance = hasPermission("business_center", "compliance_view");

  const [subTab, setSubTab] = useState<"skills" | "okf" | "governance">("skills");
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);

  useEffect(() => {
    if (subTab === "skills" && !canViewSkills) {
      if (canViewOkf) setSubTab("okf");
      else if (canViewCompliance) setSubTab("governance");
    } else if (subTab === "okf" && !canViewOkf) {
      if (canViewSkills) setSubTab("skills");
      else if (canViewCompliance) setSubTab("governance");
    } else if (subTab === "governance" && !canViewCompliance) {
      if (canViewSkills) setSubTab("skills");
      else if (canViewOkf) setSubTab("okf");
    }
  }, [subTab, canViewSkills, canViewOkf, canViewCompliance]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 p-6">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-900 pb-5 mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Business Policy &amp; Library Center</h1>
          <p className="text-slate-500 text-xs mt-1">Manage global enterprise rules, custom agent skills, and OKF guidelines namespaces</p>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex flex-row min-h-0 gap-6">
        {/* Left vertical navigation menu */}
        <div 
          className={`shrink-0 flex flex-col space-y-1.5 border-r border-slate-900 transition-all duration-200 ${
            isNavCollapsed ? "w-14 pr-2" : "w-64 pr-6"
          }`}
        >
          {/* Collapse / Expand Toggle Button */}
          <div className={`flex items-center pb-2 mb-1 border-b border-slate-900/60 ${isNavCollapsed ? "justify-center" : "justify-between"}`}>
            {!isNavCollapsed && (
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                Catalog Navigation
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsNavCollapsed(!isNavCollapsed)}
              className="p-1.5 rounded-lg border border-slate-850 hover:border-slate-750 bg-slate-900/40 text-slate-400 hover:text-white transition-all text-xs"
              title={isNavCollapsed ? "Expand Navigation Panel" : "Collapse Navigation Panel"}
            >
              {isNavCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          {canViewSkills && (
            <button
              type="button"
              onClick={() => setSubTab("skills")}
              className={`flex items-center gap-3 w-full rounded-xl text-xs font-semibold tracking-wide transition-all text-left ${
                isNavCollapsed ? "px-2.5 py-3 justify-center" : "px-4 py-3"
              } ${
                subTab === "skills"
                  ? "bg-indigo-600/10 border border-indigo-500/30 text-white font-bold"
                  : "border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
              title={isNavCollapsed ? "Universal Skills Registry" : undefined}
            >
              <Wrench className={`h-4 w-4 shrink-0 ${subTab === "skills" ? "text-indigo-400" : "text-slate-500"}`} />
              {!isNavCollapsed && <span>Universal Skills Registry</span>}
            </button>
          )}

          {canViewOkf && (
            <button
              type="button"
              onClick={() => setSubTab("okf")}
              className={`flex items-center gap-3 w-full rounded-xl text-xs font-semibold tracking-wide transition-all text-left ${
                isNavCollapsed ? "px-2.5 py-3 justify-center" : "px-4 py-3"
              } ${
                subTab === "okf"
                  ? "bg-indigo-600/10 border border-indigo-500/30 text-white font-bold"
                  : "border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
              title={isNavCollapsed ? "Google OKF Concepts" : undefined}
            >
              <BookOpen className={`h-4 w-4 shrink-0 ${subTab === "okf" ? "text-indigo-400" : "text-slate-500"}`} />
              {!isNavCollapsed && <span>Google OKF Concepts</span>}
            </button>
          )}

          {canViewCompliance && (
            <button
              type="button"
              onClick={() => setSubTab("governance")}
              className={`flex items-center gap-3 w-full rounded-xl text-xs font-semibold tracking-wide transition-all text-left ${
                isNavCollapsed ? "px-2.5 py-3 justify-center" : "px-4 py-3"
              } ${
                subTab === "governance"
                  ? "bg-indigo-600/10 border border-indigo-500/30 text-white font-bold"
                  : "border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
              title={isNavCollapsed ? "Compliance & PII Rules" : undefined}
            >
              <ShieldCheck className={`h-4 w-4 shrink-0 ${subTab === "governance" ? "text-indigo-400" : "text-slate-500"}`} />
              {!isNavCollapsed && <span>Compliance &amp; PII Rules</span>}
            </button>
          )}
        </div>

        {/* Right dedicated workspace */}
        <div className="flex-1 min-h-0 bg-slate-950/40 rounded-2xl overflow-hidden flex flex-col">
          {subTab === "skills" && canViewSkills && <SkillsRegistry />}
          {subTab === "okf" && canViewOkf && <OkfRegistry />}
          {subTab === "governance" && canViewCompliance && <ComplianceManager />}
        </div>
      </div>
    </div>
  );
}
