"use client";

import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Split, AlignJustify, GitCompare } from "lucide-react";
import { computeLineDiff } from "@/lib/diff-utils";

interface DiffViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badgeLabel?: string;
  oldVersionLabel: string;
  newVersionLabel: string;
  oldContent: string;
  newContent: string;
  authorEmail?: string;
  timestamp?: string;
}

export function DiffViewerModal({
  isOpen,
  onClose,
  title,
  subtitle,
  badgeLabel,
  oldVersionLabel,
  newVersionLabel,
  oldContent,
  newContent,
  authorEmail,
  timestamp,
}: DiffViewerModalProps) {
  const [viewMode, setViewMode] = useState<"unified" | "split">("unified");
  const [copied, setCopied] = useState(false);

  const diffLines = useMemo(() => {
    return computeLineDiff(oldContent || "", newContent || "");
  }, [oldContent, newContent]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    diffLines.forEach((l) => {
      if (l.type === "added") added++;
      if (l.type === "removed") removed++;
    });
    return { added, removed };
  }, [diffLines]);

  const handleCopyNewContent = () => {
    navigator.clipboard.writeText(newContent || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const oldLines = useMemo(() => (oldContent ? oldContent.split("\n") : []), [oldContent]);
  const newLines = useMemo(() => (newContent ? newContent.split("\n") : []), [newContent]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-6 bg-card text-card-foreground border-border">
        <DialogHeader className="pb-3 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <GitCompare className="w-5 h-5 text-primary" />
                <DialogTitle className="text-lg font-bold text-foreground">
                  {title}
                </DialogTitle>
                {badgeLabel && (
                  <Badge variant="outline" className="text-xs bg-muted text-muted-foreground border-border">
                    {badgeLabel}
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                {subtitle || "Comparing previous snapshot against latest saved revision."}
                {authorEmail && ` • Author: ${authorEmail}`}
                {timestamp && ` • ${new Date(timestamp).toLocaleString()}`}
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === "unified" ? "split" : "unified")}
                className="h-8 gap-1.5 text-xs border-border"
              >
                {viewMode === "unified" ? (
                  <>
                    <Split className="w-3.5 h-3.5" /> Split View
                  </>
                ) : (
                  <>
                    <AlignJustify className="w-3.5 h-3.5" /> Unified View
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyNewContent}
                className="h-8 gap-1.5 text-xs border-border"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy Latest"}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-muted-foreground">Base:</span>
              <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                {oldVersionLabel}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-muted-foreground">Target:</span>
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-medium">
                {newVersionLabel}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2 font-mono">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">+{stats.added}</span>
              <span className="text-rose-600 dark:text-rose-400 font-medium">-{stats.removed}</span>
            </div>
          </div>
        </DialogHeader>

        {/* Diff content view */}
        <div className="flex-1 overflow-auto rounded-md border border-border bg-background mt-4 p-2 font-mono text-xs leading-relaxed">
          {viewMode === "unified" ? (
            <div className="divide-y divide-border/30">
              {diffLines.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No content differences detected.</div>
              ) : (
                diffLines.map((line, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 px-2 py-0.5 select-text ${
                      line.type === "added"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-l-2 border-emerald-500"
                        : line.type === "removed"
                        ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-l-2 border-rose-500 line-through opacity-80"
                        : "text-muted-foreground hover:bg-muted/30"
                    }`}
                  >
                    <span className="w-8 shrink-0 text-right opacity-40 select-none">
                      {line.oldLineNumber || ""}
                    </span>
                    <span className="w-8 shrink-0 text-right opacity-40 select-none">
                      {line.newLineNumber || ""}
                    </span>
                    <span className="w-4 shrink-0 font-bold select-none">
                      {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                    </span>
                    <span className="flex-1 whitespace-pre-wrap break-all font-mono">
                      {line.content || " "}
                    </span>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* Split View */
            <div className="grid grid-cols-2 gap-2 h-full">
              <div className="border-r border-border pr-2 overflow-auto">
                <div className="text-[11px] font-semibold text-muted-foreground mb-2 sticky top-0 bg-background py-1 border-b border-border">
                  {oldVersionLabel} (Previous)
                </div>
                {oldLines.map((line, idx) => (
                  <div key={idx} className="flex items-start gap-2 py-0.5 text-muted-foreground">
                    <span className="w-8 shrink-0 text-right opacity-40 select-none">{idx + 1}</span>
                    <span className="flex-1 whitespace-pre-wrap break-all font-mono">{line || " "}</span>
                  </div>
                ))}
              </div>
              <div className="pl-2 overflow-auto">
                <div className="text-[11px] font-semibold text-primary mb-2 sticky top-0 bg-background py-1 border-b border-border">
                  {newVersionLabel} (Target)
                </div>
                {newLines.map((line, idx) => (
                  <div key={idx} className="flex items-start gap-2 py-0.5 text-foreground">
                    <span className="w-8 shrink-0 text-right opacity-40 select-none">{idx + 1}</span>
                    <span className="flex-1 whitespace-pre-wrap break-all font-mono">{line || " "}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
