"use client";

import React, { useState, useMemo } from "react";
import { Search, Wrench, Server, Check, X, SlidersHorizontal, CheckCircle2, Circle } from "lucide-react";

export interface ToolItem {
  name: string;
  category: "native" | "mcp" | "custom" | "open" | "database" | "social_media" | string;
  serverId?: string;
  description?: string;
  parametersSummary?: string;
  status?: "active" | "disabled" | "configured";
}

interface ToolDataTableProps {
  tools: ToolItem[];
  selectedToolKeys: Set<string>; // keyed as `${category}::${name}` or `${serverId}::${name}`
  onToggleTool: (tool: ToolItem) => void;
  onBulkToggle: (toolsToToggle: ToolItem[], enable: boolean) => void;
  isLoading?: boolean;
  filterCategories?: string[];
  emptyMessage?: string;
}

export function ToolDataTable({
  tools,
  selectedToolKeys,
  onToggleTool,
  onBulkToggle,
  isLoading = false,
  filterCategories = ["all", "native", "mcp", "custom"],
  emptyMessage = "No tools match the selected filters.",
}: ToolDataTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const filteredTools = useMemo(() => {
    return tools.filter((tool) => {
      // Category filter
      if (activeCategory !== "all") {
        if (activeCategory === "mcp" && tool.category !== "mcp") return false;
        if (activeCategory === "native" && tool.category !== "native" && tool.category !== "open") return false;
        if (activeCategory === "custom" && tool.category !== "custom") return false;
        if (activeCategory !== "mcp" && activeCategory !== "native" && activeCategory !== "custom") {
          if (tool.category !== activeCategory) return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameMatch = tool.name.toLowerCase().includes(query);
        const descMatch = (tool.description || "").toLowerCase().includes(query);
        const serverMatch = (tool.serverId || "").toLowerCase().includes(query);
        if (!nameMatch && !descMatch && !serverMatch) return false;
      }

      return true;
    });
  }, [tools, activeCategory, searchQuery]);

  const activeCount = useMemo(() => {
    return tools.filter((t) => {
      const key = t.category === "mcp" && t.serverId ? `${t.serverId}::${t.name}` : `${t.category}::${t.name}`;
      return selectedToolKeys.has(key) || selectedToolKeys.has(t.name);
    }).length;
  }, [tools, selectedToolKeys]);

  const isToolActive = (t: ToolItem) => {
    const key = t.category === "mcp" && t.serverId ? `${t.serverId}::${t.name}` : `${t.category}::${t.name}`;
    return selectedToolKeys.has(key) || selectedToolKeys.has(t.name);
  };

  return (
    <div className="space-y-3">
      {/* Top Controls: Search, Category Filters, Bulk Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools by name, server, description..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {filterCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeCategory === cat
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-900/40 text-slate-400 hover:text-slate-200 border border-slate-800/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Actions Header */}
      <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
        <div>
          Showing <span className="text-white font-semibold">{filteredTools.length}</span> tools &middot;{" "}
          <span className="text-emerald-400 font-semibold">{activeCount}</span> currently active
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onBulkToggle(filteredTools, true)}
            className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold transition-colors cursor-pointer"
          >
            Enable All Filtered
          </button>
          <span className="text-slate-700">|</span>
          <button
            type="button"
            onClick={() => onBulkToggle(filteredTools, false)}
            className="text-[10px] text-slate-500 hover:text-slate-300 font-medium transition-colors cursor-pointer"
          >
            Disable All Filtered
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden shadow-inner">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-800/80">
            <thead className="bg-slate-900/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center">Toggle</th>
                <th className="py-2.5 px-3">Tool &amp; Server</th>
                <th className="py-2.5 px-3 w-28">Category</th>
                <th className="py-2.5 px-3">Description &amp; Parameters</th>
                <th className="py-2.5 px-3 w-24 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                    Loading tool registry...
                  </td>
                </tr>
              ) : filteredTools.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 text-xs italic">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                filteredTools.map((tool) => {
                  const active = isToolActive(tool);
                  return (
                    <tr
                      key={`${tool.serverId || tool.category}::${tool.name}`}
                      onClick={() => onToggleTool(tool)}
                      className={`hover:bg-slate-900/50 transition-colors cursor-pointer select-none ${
                        active ? "bg-emerald-500/[0.04]" : ""
                      }`}
                    >
                      {/* Toggle Checkbox / Switch */}
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onToggleTool(tool)}
                          className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            active ? "bg-emerald-500" : "bg-slate-700"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                              active ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </td>

                      {/* Tool Name & Server */}
                      <td className="py-3 px-3">
                        <div className="font-mono text-xs font-bold text-slate-200 flex items-center gap-1.5">
                          {tool.category === "mcp" ? (
                            <Server className="h-3 w-3 text-purple-400 shrink-0" />
                          ) : (
                            <Wrench className="h-3 w-3 text-amber-400 shrink-0" />
                          )}
                          <span>{tool.name}</span>
                        </div>
                        {tool.serverId && (
                          <div className="text-[10px] text-purple-400/80 font-mono mt-0.5">
                            server: {tool.serverId}
                          </div>
                        )}
                      </td>

                      {/* Category Badge */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                            tool.category === "mcp"
                              ? "bg-purple-500/10 text-purple-300 border-purple-500/20"
                              : tool.category === "native"
                              ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                              : "bg-cyan-500/10 text-cyan-300 border-cyan-500/20"
                          }`}
                        >
                          {tool.category}
                        </span>
                      </td>

                      {/* Description & Parameters */}
                      <td className="py-3 px-3">
                        <div className="text-slate-400 text-[11px] leading-relaxed line-clamp-2">
                          {tool.description || "No description provided."}
                        </div>
                        {tool.parametersSummary && (
                          <div className="text-[9px] font-mono text-slate-500 mt-1">
                            params: {tool.parametersSummary}
                          </div>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            active
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              : "bg-slate-800 text-slate-500 border-slate-700"
                          }`}
                        >
                          {active ? (
                            <>
                              <Check className="h-2.5 w-2.5" /> Active
                            </>
                          ) : (
                            "Disabled"
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
