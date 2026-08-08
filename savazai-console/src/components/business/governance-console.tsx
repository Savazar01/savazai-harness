"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Terminal, 
  RefreshCw, 
  Activity, 
  Loader2
} from "lucide-react";

interface AuditLogEntry {
  timestamp: string;
  operation: "mask" | "unmask";
  categories: { type: string; count: number; label: string }[];
  totalMasked: number;
}

export function GovernanceConsole() {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [streamActive, setStreamActive] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
    
    let interval: NodeJS.Timeout;
    if (streamActive) {
      interval = setInterval(fetchLogs, 5000);
    }
    return () => clearInterval(interval);
  }, [streamActive, fetchLogs]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [auditLogs]);

  return (
    <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col min-h-0">
      <div className="border border-slate-900 bg-slate-950/20 rounded-2xl p-5 flex flex-col flex-1 min-h-0">
        <div className="flex justify-between items-center mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-indigo-400 animate-pulse" />
            <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">Gateway Masking Audit Stream</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] text-slate-400 font-semibold uppercase">
              <input 
                type="checkbox" 
                checked={streamActive} 
                onChange={(e) => setStreamActive(e.target.checked)}
                className="rounded border-slate-800 bg-slate-950 text-indigo-650 focus:ring-0 cursor-pointer"
              />
              Live Stream Logs
            </label>
            <button 
              type="button" 
              onClick={fetchLogs} 
              disabled={loadingLogs}
              className="p-1.5 rounded-lg border border-slate-850 hover:border-slate-750 bg-slate-900/50 text-slate-400 hover:text-white transition-all shrink-0"
              title="Force log refresh"
            >
              {loadingLogs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Console logs container */}
        <div className="flex-1 rounded-2xl border border-slate-900 bg-[#040408] p-4 font-mono text-[10px] text-slate-400 overflow-y-auto space-y-3 relative min-h-0 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-850">
          {auditLogs.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700 gap-2">
              <Activity className="h-6 w-6 text-slate-800 animate-pulse" />
              <span>No masking transactions captured yet...</span>
            </div>
          ) : (
            auditLogs.map((log, idx) => (
              <div key={idx} className="border-b border-slate-950/60 pb-2.5 last:border-0 hover:bg-slate-950/20 transition-all px-1.5 py-1 rounded">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 font-bold">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                      log.operation === "mask" 
                        ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" 
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}>
                      {log.operation === "mask" ? "INCOMING_PII_MASKED" : "OUTGOING_HYDRATED"}
                    </span>
                    <span className="text-slate-500 font-medium text-[9px]">transaction completed</span>
                  </div>
                  <span className="text-slate-650 text-[9px] font-semibold">Total Fields: {log.totalMasked}</span>
                </div>
                
                <div className="flex flex-wrap gap-1.5 pl-3">
                  {log.categories.map((c, cIdx) => (
                    <span key={cIdx} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-850 text-slate-500 text-[9px]">
                      {c.label}: <strong className="text-indigo-400 font-bold font-mono">{c.count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
