"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Users,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Sparkles,
  MoveDiagonal2,
} from "lucide-react";
import { CanvasNode } from "../canvas-editor";
import { getTeamDimensions } from "@/lib/agentflow-utils";

export interface TeamNodeProps {
  node: CanvasNode;
  childWorkers: CanvasNode[];
  isSelected: boolean;
  isHoveredTarget?: boolean;
  zoom?: number;
  onSelect: () => void;
  onDoubleClick: () => void;
  onToggleCollapse: () => void;
  onRename: (newName: string) => void;
  onAddWorker: () => void;
  onDelete: () => void;
  onResize?: (width: number, height: number) => void;
  onOutputHandleMouseDown: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function TeamNode({
  node,
  childWorkers,
  isSelected,
  isHoveredTarget = false,
  zoom = 1,
  onSelect,
  onDoubleClick,
  onToggleCollapse,
  onRename,
  onAddWorker,
  onDelete,
  onResize,
  onOutputHandleMouseDown,
  onMouseDown,
}: TeamNodeProps) {
  const isCollapsed = node.collapsed ?? false;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(node.label || "Specialist Team");
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [isResizing, setIsResizing] = useState(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 760, h: 420 });

  useEffect(() => {
    setTitleInput(node.label || "Specialist Team");
  }, [node.label]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleTitleSubmit = () => {
    const trimmed = titleInput.trim();
    if (trimmed && trimmed !== node.label) {
      onRename(trimmed);
    } else {
      setTitleInput(node.label || "Specialist Team");
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleTitleSubmit();
    } else if (e.key === "Escape") {
      setTitleInput(node.label || "Specialist Team");
      setIsEditingTitle(false);
    }
  };

  // Generous Dynamic Auto-Sizing
  const workerCount = childWorkers.length;
  const dims = getTeamDimensions(workerCount, false, node.width, node.height);
  const expandedWidth = dims.width;
  const expandedHeight = dims.height;

  // Resize handler for bottom-right corner drag
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      w: expandedWidth,
      h: expandedHeight,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - resizeStart.current.x) / zoom;
      const dy = (moveEvent.clientY - resizeStart.current.y) / zoom;
      const newWidth = Math.max(540, Math.round(resizeStart.current.w + dx));
      const newHeight = Math.max(320, Math.round(resizeStart.current.h + dy));
      if (onResize) {
        onResize(newWidth, newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [expandedWidth, expandedHeight, zoom, onResize]);

  if (isCollapsed) {
    // ── Minimized / Compact Hero Card ──
    return (
      <div
        className="absolute group select-none"
        style={{ left: `${node.x}px`, top: `${node.y}px` }}
      >
        {/* Left Input Port (Indigo Target Handle) */}
        <div
          className="absolute w-4 h-4 rounded-full bg-indigo-500 ring-4 ring-card -left-2 top-8 z-20 cursor-crosshair hover:scale-125 transition-transform shadow-lg shadow-indigo-500/30"
          title="Team Target Bus (Input Port)"
        />

        {/* Right Output Port (Teal Source Handle) */}
        <div
          onMouseDown={onOutputHandleMouseDown}
          className="absolute w-4 h-4 rounded-full bg-teal-400 ring-4 ring-card -right-2 top-8 z-20 cursor-crosshair hover:scale-125 transition-transform shadow-lg shadow-teal-400/30"
          title="Team Source Bus (Output Port — drag to connect)"
        />

        {/* Compact Card */}
        <div
          onMouseDown={onMouseDown}
          onClick={onSelect}
          onDoubleClick={onDoubleClick}
          className={`team-node-container w-[280px] h-[90px] rounded-2xl border px-3.5 py-3 flex flex-col justify-between transition-all backdrop-blur-md shadow-2xl canvas-cursor-grab active:canvas-cursor-grabbing ${
            isHoveredTarget
              ? "border-indigo-400 bg-indigo-100 dark:bg-indigo-900/60 ring-4 ring-indigo-500/50 scale-[1.03]"
              : isSelected
              ? "border-indigo-500/80 bg-indigo-50 dark:bg-indigo-950/50 ring-2 ring-indigo-500/80 shadow-indigo-500/20"
              : "border-indigo-500/30 bg-background/80 hover:border-indigo-400/50 hover:bg-muted/80"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="p-1.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 shrink-0">
                <Users className="h-4 w-4" />
              </div>

              {isEditingTitle ? (
                <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    onBlur={handleTitleSubmit}
                    className="w-full text-xs font-bold text-foreground bg-background border border-indigo-500 rounded-lg px-2 py-0.5 outline-none font-sans"
                  />
                  <button
                    type="button"
                    onClick={handleTitleSubmit}
                    className="p-1 rounded bg-indigo-600 text-white hover:bg-indigo-500"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTitleInput(node.label || "Specialist Team");
                      setIsEditingTitle(false);
                    }}
                    className="p-1 rounded bg-slate-800 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0 flex-1 group/title">
                  <span className="text-xs font-bold text-foreground truncate tracking-tight">
                    {node.label || "Specialist Team"}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditingTitle(true);
                    }}
                    className="opacity-0 group-hover/title:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground transition-opacity"
                    title="Rename Team"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapse();
                }}
                className="p-1.5 rounded-lg bg-card hover:bg-muted text-foreground/80 hover:text-foreground border border-border shadow-xs transition-all flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                title="Expand Team Container"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Footer Bar with Specialist count */}
          <div className="flex items-center justify-between border-t border-indigo-500/20 pt-1.5 mt-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
              <Sparkles className="h-2.5 w-2.5 text-indigo-400" />
              {workerCount} {workerCount === 1 ? "Specialist" : "Specialists"}
            </span>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddWorker();
                }}
                className="p-1 rounded-md bg-card border border-border text-foreground/80 hover:text-foreground hover:bg-muted transition-all cursor-pointer shadow-xs"
                title="Add Worker to Team"
              >
                <Plus className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1 rounded-md bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 transition-all cursor-pointer shadow-xs"
                title="Delete Team"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Expanded Glassmorphic Container View (Auto-Sized & Resizable) ──
  return (
    <div
      className="absolute group select-none"
      style={{
        left: `${node.x}px`,
        top: `${node.y}px`,
        width: `${expandedWidth}px`,
        height: `${expandedHeight}px`,
      }}
    >
      {/* Left Input Port (Indigo Target Handle) */}
      <div
        className="absolute w-4 h-4 rounded-full bg-indigo-500 ring-4 ring-card -left-2 top-8 z-20 cursor-crosshair hover:scale-125 transition-transform shadow-lg shadow-indigo-500/30"
        title="Team Target Bus (Input Port)"
      />

      {/* Right Output Port (Teal Source Handle) */}
      <div
        onMouseDown={onOutputHandleMouseDown}
        className="absolute w-4 h-4 rounded-full bg-teal-400 ring-4 ring-card -right-2 top-8 z-20 cursor-crosshair hover:scale-125 transition-transform shadow-lg shadow-teal-400/30"
        title="Team Source Bus (Output Port — drag to connect)"
      />

      {/* Expanded Container Box */}
      <div
        onMouseDown={onMouseDown}
        onClick={onSelect}
        onDoubleClick={onDoubleClick}
        className={`team-node-container w-full h-full rounded-3xl border-2 border-dashed p-6 flex flex-col transition-all backdrop-blur-md canvas-cursor-grab active:canvas-cursor-grabbing shadow-2xl relative ${
          isHoveredTarget
            ? "border-indigo-400 bg-indigo-50 dark:bg-muted ring-4 ring-indigo-500/40"
            : isSelected
            ? "border-indigo-500/80 bg-card dark:bg-indigo-950/30 ring-2 ring-indigo-500/60 shadow-indigo-500/10"
            : "border-indigo-500/40 bg-card/90 dark:bg-indigo-950/20 hover:border-indigo-400/60 hover:bg-card dark:bg-indigo-950/25"
        }`}
      >
        {/* Container Header Bar */}
        <div className="flex items-center justify-between pb-3.5 border-b border-indigo-500/20 shrink-0">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 shrink-0">
              <Users className="h-4 w-4" />
            </div>

            {isEditingTitle ? (
              <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  onBlur={handleTitleSubmit}
                  className="text-xs font-bold text-foreground bg-background border border-indigo-500 rounded-lg px-2.5 py-1 outline-none w-64"
                />
                <button
                  type="button"
                  onClick={handleTitleSubmit}
                  className="p-1 rounded bg-indigo-600 text-white hover:bg-indigo-500"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTitleInput(node.label || "Specialist Team");
                    setIsEditingTitle(false);
                  }}
                  className="p-1 rounded bg-slate-800 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0 group/title">
                <span className="text-sm font-bold text-foreground tracking-tight truncate">
                  {node.label || "Specialist Team"}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingTitle(true);
                  }}
                  className="opacity-0 group-hover/title:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground transition-opacity"
                  title="Rename Team"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                  {workerCount} {workerCount === 1 ? "Specialist" : "Specialists"}
                </span>
              </div>
            )}
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddWorker();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all hover:scale-105"
              title="Add Worker inside Team"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Worker</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse();
              }}
              className="p-1.5 rounded-xl bg-card border border-border hover:bg-muted text-foreground/80 hover:text-foreground shadow-xs transition-all cursor-pointer"
              title="Collapse Team Container"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 rounded-xl bg-destructive/10 border border-destructive/30 hover:bg-destructive/20 text-destructive shadow-xs transition-all cursor-pointer"
              title="Delete Team"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Inner Canvas Guidance Placeholder (when team is empty) */}
        {workerCount === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-indigo-500/20 rounded-2xl m-3 bg-muted/40 text-center p-6">
            <Users className="h-8 w-8 text-indigo-400/40 mb-2" />
            <p className="text-xs font-bold text-muted-foreground">Team is currently empty</p>
            <p className="text-[10px] text-muted-foreground mt-1 max-w-sm">
              Specialist workers reside inside this team. Click <span className="text-indigo-300 font-semibold">&lsquo;+ Add Worker&rsquo;</span> above to create your first specialist.
            </p>
          </div>
        )}

        {/* Corner Drag-to-Resize Handle */}
        <div
          onMouseDown={handleResizeMouseDown}
          className={`absolute bottom-2 right-2 p-1.5 rounded-lg cursor-nwse-resize select-none transition-all z-30 ${
            isResizing
              ? "bg-indigo-600 text-white scale-125"
              : "text-muted-foreground hover:text-indigo-400 hover:bg-indigo-50 dark:bg-muted"
          }`}
          title="Drag to resize team container width and height"
        >
          <MoveDiagonal2 className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
