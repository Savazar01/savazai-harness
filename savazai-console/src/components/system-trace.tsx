"use client";

import React, { useState } from "react";
import {
  Activity,
  ShieldCheck,
  Bot,
  Wrench,
  Terminal,
  ChevronDown,
  ChevronUp,
  Code,
  PanelRightClose,
  PanelRight,
  Compass,
  Sparkles,
  Layers,
} from "lucide-react";

export interface TraceEvent {
  id: string;
  type: "node" | "masking" | "tool" | "completion" | "routing" | "synthesis";
  label: string;
  detail?: string;
  timestamp: string;
  payload?: {
    input?: string;
    llmDecision?: string;
    response?: string;
    piiFields?: Array<{ type: string; count: number; label: string }>;
  };
}

interface SystemTraceProps {
  events: TraceEvent[];
  isOpen: boolean;
  onToggle: () => void;
}

function TraceIcon({ type }: { type: TraceEvent["type"] }) {
  switch (type) {
    case "routing":
      return <Compass className="h-3.5 w-3.5 text-purple-400" />;
    case "node":
      return <Layers className="h-3.5 w-3.5 text-indigo-400" />;
    case "masking":
      return <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />;
    case "tool":
      return <Wrench className="h-3.5 w-3.5 text-amber-400" />;
    case "synthesis":
      return <Sparkles className="h-3.5 w-3.5 text-sky-400" />;
    case "completion":
      return <Terminal className="h-3.5 w-3.5 text-cyan-400" />;
    default:
      return <Bot className="h-3.5 w-3.5 text-slate-400" />;
  }
}

function TraceBadge({ type }: { type: TraceEvent["type"] }) {
  const styles: Record<TraceEvent["type"], string> = {
    routing: "bg-purple-500/10 text-purple-300 border-purple-500/20",
    node: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
    masking: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    tool: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    synthesis: "bg-sky-500/10 text-sky-300 border-sky-500/20",
    completion: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${styles[type] || "bg-slate-800 text-slate-300 border-slate-700"}`}
    >
      <TraceIcon type={type} />
      {type}
    </span>
  );
}

function CodeBlock({ label, content }: { label: string; content: string }) {
  const [open, setOpen] = useState(false);
  if (!content) return null;
  return (
    <div className="border-t border-slate-800/60 pt-1.5 mt-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 hover:text-slate-300 transition-colors w-full text-left"
      >
        <Code className="h-3 w-3 shrink-0" />
        {label}
        {open ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>
      {open && (
        <pre className="mt-1 p-2 rounded-lg bg-slate-950 border border-slate-800 text-[10px] text-slate-400 font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
          {content}
        </pre>
      )}
    </div>
  );
}

function PiiBadgeMatrix({ fields }: { fields: Array<{ type: string; count: number; label: string }> }) {
  if (!fields?.length) return null;
  return (
    <div className="mt-2 p-2 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Scanned PII Fields</p>
      {fields.map((f) => (
        <div key={f.type} className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400">{f.label}</span>
          <div className="flex items-center gap-2">
            <div className="flex gap-[1px]">
              {Array.from({ length: Math.min(f.count, 8) }).map((_, i) => (
                <span key={i} className="block h-3 w-2 rounded-sm bg-emerald-500/60" />
              ))}
            </div>
            <span className="text-emerald-400 font-mono tabular-nums">{f.count} found</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SystemTrace({ events, isOpen, onToggle }: SystemTraceProps) {
  const panelContent = (
    <div className="flex flex-col h-full bg-[#0c0c14] border-l border-slate-800/80">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold text-slate-200">
            System Trace
          </span>
          {events.length > 0 && (
            <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full font-mono">
              {events.length}
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Collapse System Trace"
          aria-label="Collapse System Trace"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center px-4">
            <Activity className="h-6 w-6 text-slate-700 mb-2" />
            <p className="text-xs text-slate-500 font-medium">No trace events yet</p>
            <p className="text-[10px] text-slate-600 mt-1">Send a message to inspect routing, PII masking, and MCP tool executions</p>
          </div>
        ) : (
          events.map((event) => (
            <TraceEventCard key={event.id} event={event} />
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Floating vertical docked tab when collapsed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2 py-3.5 px-2 bg-slate-900/95 hover:bg-slate-850 border-l border-y border-indigo-500/40 text-slate-300 hover:text-white rounded-l-2xl shadow-2xl shadow-black/80 transition-all cursor-pointer backdrop-blur-md group"
          title="Open System Trace"
          aria-label="Open System Trace"
        >
          <PanelRight className="h-4 w-4 text-indigo-400 group-hover:scale-110 transition-transform" />
          <span className="[writing-mode:vertical-lr] text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-indigo-300">
            System Trace {events.length > 0 ? `(${events.length})` : ""}
          </span>
        </button>
      )}

      {/* Desktop structural column — pushes chat content smoothly */}
      <div
        className={`hidden lg:block transition-all duration-300 overflow-hidden shrink-0 ${
          isOpen ? "w-80" : "w-0"
        }`}
      >
        <div className="w-80 h-full">
          {panelContent}
        </div>
      </div>
    </>
  );
}

function TraceEventCard({ event }: { event: TraceEvent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3 space-y-1.5 transition-all cursor-pointer hover:bg-slate-850/60 hover:border-slate-700/80"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between">
        <TraceBadge type={event.type} />
        <span className="text-[10px] text-slate-500 font-mono">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <p className="text-xs font-semibold text-slate-200">
        {event.label}
      </p>
      {event.detail && (
        <p className="text-[11px] text-slate-400 leading-relaxed font-mono break-all">
          {event.detail}
        </p>
      )}
      {expanded && (
        <div className="mt-2 space-y-1 pt-1 border-t border-slate-800/50">
          {event.type === "masking" && event.payload?.piiFields && (
            <PiiBadgeMatrix fields={event.payload.piiFields} />
          )}
          {event.payload?.input && (
            <CodeBlock label="Input Object Payload" content={event.payload.input} />
          )}
          {event.payload?.llmDecision && (
            <CodeBlock label="Raw LLM JSON Decision" content={event.payload.llmDecision} />
          )}
          {event.payload?.response && (
            <CodeBlock label="Returned Response" content={event.payload.response} />
          )}
          {!event.payload?.input && !event.payload?.llmDecision && !event.payload?.response && !event.payload?.piiFields && (
            <p className="text-[10px] text-slate-500 italic">No additional payload data</p>
          )}
        </div>
      )}
    </div>
  );
}
