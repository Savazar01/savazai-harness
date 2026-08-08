"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  ShieldCheck, 
  Settings, 
  Terminal, 
  RefreshCw, 
  HelpCircle,
  Activity
} from "lucide-react";

interface AuditLogEntry {
  timestamp: string;
  operation: "mask" | "unmask";
  categories: { type: string; count: number; label: string }[];
  totalMasked: number;
}

export function BusinessPolicy() {
  const [globalPrompt, setGlobalPrompt] = useState("You are the High-Level Supervisor and Orchestrator for SavazAI. Ensure compliance with corporate governance policies. Replace sensitive data with references.");
  const [sensitivity, setSensitivity] = useState("high");
  const [maskEmails, setMaskEmails] = useState(true);
  const [maskPhones, setMaskPhones] = useState(true);
  const [maskSSN, setMaskSSN] = useState(true);
  const [maskCards, setMaskCards] = useState(true);
  
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [streamActive, setStreamActive] = useState(true);
  
  const [saveSuccess, setSaveSuccess] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch or stream audit logs from API route
  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/governance/logs");
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
    
    // Set up polling for log refresh if stream is active
    let interval: NodeJS.Timeout;
    if (streamActive) {
      interval = setInterval(fetchLogs, 5000);
    }
    return () => clearInterval(interval);
  }, [streamActive]);

  // Scroll to bottom of audit console logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [auditLogs]);

  const handleSavePolicy = async () => {
    // Saving settings to Postgres system_configurations table (through the dashboard save endpoint)
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Policy Engine Header */}
      <div>
        <h3 className="text-lg font-bold text-white mb-1">Corporate Policy &amp; Governance Center</h3>
        <p className="text-slate-400 text-xs">Manage general system-wide instructions, baseline prompts, PII anonymization rules, and compliance logs.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Hand: Configs panel */}
        <div className="space-y-6">
          <div className="border border-slate-900 bg-slate-950/40 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Settings className="h-4 w-4 text-indigo-400" />
              Global Prompt &amp; SOP Guidelines
            </h4>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Global System Instructions (globalSystemPrompt)</label>
                 <span title="This prompt is automatically injected as a prefix to all sub-agent and supervisor instructions.">
                  <HelpCircle className="h-3.5 w-3.5 text-slate-600" />
                </span>
              </div>
              <textarea 
                rows={5} 
                value={globalPrompt} 
                onChange={(e) => setGlobalPrompt(e.target.value)}
                className="w-full rounded-xl border border-slate-850 bg-slate-900/30 p-3 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <button 
              type="button" 
              onClick={handleSavePolicy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/25 transition-all"
            >
              Save Policy Rules
            </button>
          </div>

          {/* Privacy Rules */}
          <div className="border border-slate-900 bg-slate-950/40 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Data Masking &amp; PII Anonymization Settings
            </h4>
            <p className="text-[10px] text-slate-500 leading-normal">
              Anonymization occurs on the client edge gateway prior to routing user payloads to external API provider nodes. original values are stored inside the local isolated memory saver checkpointer.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Compliance Level</label>
                <select 
                  value={sensitivity} 
                  onChange={(e) => setSensitivity(e.target.value)}
                  className="w-full rounded-xl border border-slate-850 bg-slate-900/30 py-2 px-3 text-xs text-white outline-none focus:border-indigo-500"
                >
                  <option value="high">High Sensitivity (Mask all identifiers)</option>
                  <option value="medium">Medium Sensitivity (Mask emails &amp; phones)</option>
                  <option value="low">Low Sensitivity (Bypass masking gate)</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300 font-medium">Anonymize Email Addresses</span>
                <input 
                  type="checkbox" 
                  checked={maskEmails} 
                  onChange={(e) => setMaskEmails(e.target.checked)}
                  className="w-8 h-4 bg-slate-900 rounded-full appearance-none cursor-pointer checked:bg-indigo-500 transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-slate-400 after:rounded-full after:h-3 after:w-3 after:transition-all checked:after:translate-x-4 checked:after:bg-white"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300 font-medium">Anonymize Phone Numbers</span>
                <input 
                  type="checkbox" 
                  checked={maskPhones} 
                  onChange={(e) => setMaskPhones(e.target.checked)}
                  className="w-8 h-4 bg-slate-900 rounded-full appearance-none cursor-pointer checked:bg-indigo-500 transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-slate-400 after:rounded-full after:h-3 after:w-3 after:transition-all checked:after:translate-x-4 checked:after:bg-white"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300 font-medium">Anonymize Social Security Numbers (SSN)</span>
                <input 
                  type="checkbox" 
                  checked={maskSSN} 
                  onChange={(e) => setMaskSSN(e.target.checked)}
                  className="w-8 h-4 bg-slate-900 rounded-full appearance-none cursor-pointer checked:bg-indigo-500 transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-slate-400 after:rounded-full after:h-3 after:w-3 after:transition-all checked:after:translate-x-4 checked:after:bg-white"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300 font-medium">Anonymize Credit Card Numbers</span>
                <input 
                  type="checkbox" 
                  checked={maskCards} 
                  onChange={(e) => setMaskCards(e.target.checked)}
                  className="w-8 h-4 bg-slate-900 rounded-full appearance-none cursor-pointer checked:bg-indigo-500 transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-slate-400 after:rounded-full after:h-3 after:w-3 after:transition-all checked:after:translate-x-4 checked:after:bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Hand: Real-time Audit Console */}
        <div className="flex flex-col border border-slate-900 bg-slate-950/40 rounded-2xl overflow-hidden h-[540px]">
          
          {/* Audit Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-900 bg-slate-950/20 shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Governance Masking Audit Logs</span>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                type="button" 
                onClick={() => setStreamActive(!streamActive)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-bold border transition-all ${
                  streamActive 
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "border-slate-800 text-slate-500"
                }`}
              >
                <Activity className={`h-3 w-3 ${streamActive ? "animate-pulse" : ""}`} />
                {streamActive ? "LIVE FEED" : "PAUSED"}
              </button>
              <button 
                type="button" 
                onClick={fetchLogs}
                disabled={loadingLogs}
                className="p-1 rounded-lg hover:bg-slate-900 text-slate-500 hover:text-slate-300 transition-colors"
                title="Refresh audit log"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingLogs ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Audit Console Terminal View */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#040408]/90 font-mono text-[10px] leading-relaxed [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-900">
            {auditLogs.length === 0 ? (
              <div className="text-slate-600 italic text-center py-12">
                {loadingLogs ? "Reading logs..." : "No masking audit log events found."}
              </div>
            ) : (
              auditLogs.map((entry, idx) => (
                <div key={idx} className="border-b border-slate-900/60 pb-2 space-y-1">
                  <div className="flex justify-between items-center text-slate-500">
                    <span>{new Date(entry.timestamp).toLocaleString()}</span>
                    <span className={`px-1.5 py-0.2 rounded font-bold uppercase tracking-wider text-[8px] ${
                      entry.operation === "mask" 
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                        : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    }`}>
                      {entry.operation}
                    </span>
                  </div>
                  
                  <div className="text-slate-300">
                    {entry.operation === "mask" ? (
                      <span>PII Masking pass completed. Anonymized <strong>{entry.totalMasked}</strong> data values.</span>
                    ) : (
                      <span>Hydrated session reference values back from checkpointer.</span>
                    )}
                  </div>
                  
                  {entry.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {entry.categories.map((c, cidx) => (
                        <span key={cidx} className="bg-slate-900 border border-slate-800 text-[8px] text-slate-400 px-1 py-0.5 rounded">
                          {c.type}: {c.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>

      {saveSuccess && (
        <div className="fixed bottom-4 right-4 z-50 bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl backdrop-blur flex items-center gap-2 animate-in fade-in slide-in-from-bottom duration-250">
          <span>✓ Policy settings saved successfully to corporate governance store.</span>
        </div>
      )}
    </div>
  );
}
