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
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools by name, server, description..."
            className="w-full rounded-xl border border-border bg-muted/30 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
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
                  : "bg-muted/30 text-muted-foreground hover:text-foreground border border-border/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Actions Header */}
      <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
        <div>
          Showing <span className="text-foreground font-semibold">{filteredTools.length}</span> tools &middot;{" "}
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{activeCount}</span> currently active
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onBulkToggle(filteredTools, true)}
            className="text-[10px] text-primary hover:underline font-bold transition-colors cursor-pointer"
          >
            Enable All Filtered
          </button>
          <span className="text-border">|</span>
          <button
            type="button"
            onClick={() => onBulkToggle(filteredTools, false)}
            className="text-[10px] text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer"
          >
            Disable All Filtered
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-border bg-muted/40 overflow-hidden shadow-inner">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-800/80">
            <thead className="bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
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
                  <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">
                    Loading tool registry...
                  </td>
                </tr>
              ) : filteredTools.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs italic">
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
                      className={`hover:bg-muted/30 transition-colors cursor-pointer select-none ${
                        active ? "bg-emerald-500/[0.04]" : ""
                      }`}
                    >
                      {/* Toggle Checkbox / Switch */}
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onToggleTool(tool)}
                          className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            active ? "bg-emerald-500" : "bg-muted-foreground/30 border border-border"
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
                        <div className="font-mono text-xs font-bold text-foreground flex items-center gap-1.5">
                          {tool.category === "mcp" ? (
                            <Server className="h-3 w-3 text-purple-600 dark:text-purple-400 shrink-0" />
                          ) : (
                            <Wrench className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                          )}
                          <span>{tool.name}</span>
                        </div>
                        {tool.serverId && (
                          <div className="text-[10px] text-purple-700 dark:text-purple-300 font-mono mt-0.5 font-semibold">
                            server: {tool.serverId}
                          </div>
                        )}
                      </td>

                      {/* Category Badge */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                            tool.category === "mcp"
                              ? "bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-500/30"
                              : tool.category === "native"
                              ? "bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
                              : "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30"
                          }`}
                        >
                          {tool.category}
                        </span>
                      </td>

                      {/* Description & Parameters */}
                      <td className="py-3 px-3">
                        <div className="text-muted-foreground text-[11px] leading-relaxed line-clamp-2">
                          {tool.description || "No description provided."}
                        </div>
                        {tool.parametersSummary && (
                          <div className="text-[9px] font-mono text-muted-foreground mt-1">
                            params: {tool.parametersSummary}
                          </div>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            active
                              ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30"
                              : "bg-muted text-muted-foreground border-border"
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
