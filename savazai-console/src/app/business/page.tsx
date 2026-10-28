"use client";

import React, { useState, useEffect } from "react";
import { Wrench, BookOpen, ShieldCheck, Mail, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { SkillsRegistry } from "@/components/business/skills-registry";
import { OkfRegistry } from "@/components/business/okf-registry";
import { ComplianceManager } from "@/components/business/compliance-manager";
import { EmailTemplatesRegistry } from "@/components/business/email-templates-registry";
import { usePermissions } from "@/lib/auth/use-permissions";

export default function BusinessPage() {
  const { hasPermission, loading } = usePermissions();

  const canViewSkills = hasPermission("business_center", "skills_view") || hasPermission("business_center:skills_view") || loading;
  const canViewOkf = hasPermission("business_center", "okf_view") || hasPermission("business_center:okf_view") || loading;
  const canViewCompliance = hasPermission("business_center", "compliance_view") || hasPermission("business_center:compliance_view") || loading;
  const canViewEmailTemplates = canViewSkills || canViewOkf || canViewCompliance || loading;

  const [subTab, setSubTab] = useState<"skills" | "okf" | "governance" | "templates">("skills");

  const [isNavCollapsed, setIsNavCollapsed] = useState(false);

  useEffect(() => {
    if (loading) return;
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
  }, [subTab, canViewSkills, canViewOkf, canViewCompliance, loading]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground p-6">
      {/* Header */}
      <div className="shrink-0 border-b border-border pb-5 mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Business Policy &amp; Library Center</h1>
          <p className="text-muted-foreground text-xs mt-1">Manage global enterprise rules, custom agent skills, and OKF guidelines namespaces</p>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex flex-row min-h-0 gap-6">
        {/* Left vertical navigation menu */}
        <div 
          className={`shrink-0 flex flex-col space-y-1.5 border-r border-border transition-all duration-200 ${
            isNavCollapsed ? "w-14 pr-2" : "w-64 pr-6"
          }`}
        >
          {/* Collapse / Expand Toggle Button */}
          <div className={`flex items-center pb-2 mb-1 border-b border-border ${isNavCollapsed ? "justify-center" : "justify-between"}`}>
            {!isNavCollapsed && (
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
                Catalog Navigation
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsNavCollapsed(!isNavCollapsed)}
              className="p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-all text-xs cursor-pointer shadow-xs"
              title={isNavCollapsed ? "Expand Navigation Panel" : "Collapse Navigation Panel"}
            >
              {isNavCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          {canViewSkills && (
            <button
              type="button"
              onClick={() => setSubTab("skills")}
              className={`flex items-center gap-3 w-full rounded-xl text-xs font-semibold tracking-wide transition-all text-left cursor-pointer ${
                isNavCollapsed ? "px-2.5 py-3 justify-center" : "px-4 py-3"
              } ${
                subTab === "skills"
                  ? "bg-primary/10 border border-primary/30 text-primary font-bold shadow-xs"
                  : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title={isNavCollapsed ? "Universal Skills Registry" : undefined}
            >
              <Wrench className={`h-4 w-4 shrink-0 ${subTab === "skills" ? "text-primary" : "text-muted-foreground"}`} />
              {!isNavCollapsed && <span>Universal Skills Registry</span>}
            </button>
          )}

          {canViewOkf && (
            <button
              type="button"
              onClick={() => setSubTab("okf")}
              className={`flex items-center gap-3 w-full rounded-xl text-xs font-semibold tracking-wide transition-all text-left cursor-pointer ${
                isNavCollapsed ? "px-2.5 py-3 justify-center" : "px-4 py-3"
              } ${
                subTab === "okf"
                  ? "bg-primary/10 border border-primary/30 text-primary font-bold shadow-xs"
                  : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title={isNavCollapsed ? "OKF Concepts" : undefined}
            >
              <BookOpen className={`h-4 w-4 shrink-0 ${subTab === "okf" ? "text-primary" : "text-muted-foreground"}`} />
              {!isNavCollapsed && <span>OKF Concepts</span>}
            </button>
          )}

          {canViewCompliance && (
            <button
              type="button"
              onClick={() => setSubTab("governance")}
              className={`flex items-center gap-3 w-full rounded-xl text-xs font-semibold tracking-wide transition-all text-left cursor-pointer ${
                isNavCollapsed ? "px-2.5 py-3 justify-center" : "px-4 py-3"
              } ${
                subTab === "governance"
                  ? "bg-primary/10 border border-primary/30 text-primary font-bold shadow-xs"
                  : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title={isNavCollapsed ? "Compliance & PII Rules" : undefined}
            >
              <ShieldCheck className={`h-4 w-4 shrink-0 ${subTab === "governance" ? "text-primary" : "text-muted-foreground"}`} />
              {!isNavCollapsed && <span>Compliance &amp; PII Rules</span>}
            </button>
          )}

          {canViewEmailTemplates && (
            <button
              type="button"
              onClick={() => setSubTab("templates")}
              className={`flex items-center gap-3 w-full rounded-xl text-xs font-semibold tracking-wide transition-all text-left cursor-pointer ${
                isNavCollapsed ? "px-2.5 py-3 justify-center" : "px-4 py-3"
              } ${
                subTab === "templates"
                  ? "bg-primary/10 border border-primary/30 text-primary font-bold shadow-xs"
                  : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title={isNavCollapsed ? "Email Message Templates" : undefined}
            >
              <Mail className={`h-4 w-4 shrink-0 ${subTab === "templates" ? "text-primary" : "text-muted-foreground"}`} />
              {!isNavCollapsed && <span>Email Message Templates</span>}
            </button>
          )}
        </div>

        {/* Right dedicated workspace */}
        <div className="flex-1 min-h-0 bg-card border border-border rounded-2xl overflow-hidden flex flex-col shadow-xs">
          {subTab === "skills" && (canViewSkills || loading) && <SkillsRegistry />}
          {subTab === "okf" && (canViewOkf || loading) && <OkfRegistry />}
          {subTab === "governance" && (canViewCompliance || loading) && <ComplianceManager />}
          {subTab === "templates" && canViewEmailTemplates && <EmailTemplatesRegistry />}
        </div>
      </div>
    </div>
  );
}
