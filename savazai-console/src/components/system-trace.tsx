"use client";

import React from "react";
import {
  Activity,
  ShieldCheck,
  Bot,
  Wrench,
  ChevronRight,
  ChevronLeft,
  Terminal,
} from "lucide-react";

export interface TraceEvent {
  id: string;
  type: "node" | "masking" | "tool" | "completion";
  label: string;
  detail?: string;
  timestamp: string;
}

interface SystemTraceProps {
  events: TraceEvent[];
  isOpen: boolean;
  onToggle: () => void;
}

function TraceIcon({ type }: { type: TraceEvent["type"] }) {
  switch (type) {
    case "node":
      return <Bot className="h-3.5 w-3.5 text-indigo-400" />;
    case "masking":
      return <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />;
    case "tool":
      return <Wrench className="h-3.5 w-3.5 text-amber-400" />;
    case "completion":
      return <Terminal className="h-3.5 w-3.5 text-cyan-400" />;
  }
}

function TraceBadge({ type }: { type: TraceEvent["type"] }) {
  const styles: Record<TraceEvent["type"], string> = {
    node: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
    masking: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    tool: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    completion: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${styles[type]}`}
    >
      <TraceIcon type={type} />
      {type}
    </span>
  );
}

export function SystemTrace({ events, isOpen, onToggle }: SystemTraceProps) {
  return (
    <div
      className={`relative border-l border-slate-900 bg-slate-950/40 transition-all duration-300 ${
        isOpen ? "w-72" : "w-0 overflow-hidden"
      }`}
    >
      <button
        onClick={onToggle}
        className="absolute -left-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition-colors"
        aria-label={isOpen ? "Close trace" : "Open trace"}
      >
        {isOpen ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>

      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-900">
          <Activity className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-300">
            System Trace
          </span>
          {events.length > 0 && (
            <span className="ml-auto text-[10px] text-slate-500">
              {events.length} event{events.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {events.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-8">
              No trace events yet. Send a message to begin.
            </p>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="rounded-xl border border-slate-900 bg-slate-900/20 p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <TraceBadge type={event.type} />
                  <span className="text-[10px] text-slate-600">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-300">
                  {event.label}
                </p>
                {event.detail && (
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {event.detail}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
