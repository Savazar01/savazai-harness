"use client";

import React, { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code,
  FileCode,
  Quote,
  Table,
  Link2,
  Minus,
  Eye,
  Edit3,
  Columns,
  Undo2,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  disabled?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write prompt or documentation in Markdown...",
  className = "",
  minHeight = "360px",
  maxHeight = "600px",
  disabled = false,
}: MarkdownEditorProps) {
  const [viewMode, setViewMode] = useState<"edit" | "preview" | "split">("edit");
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertFormatting = useCallback(
    (prefix: string, suffix: string = "", placeholderText: string = "") => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end) || placeholderText;
      const replacement = prefix + selectedText + suffix;

      const newValue = value.substring(0, start) + replacement + value.substring(end);
      onChange(newValue);

      // Restore cursor position
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + prefix.length,
          start + prefix.length + selectedText.length
        );
      }, 0);
    },
    [value, onChange]
  );

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const lineCount = value ? value.split("\n").length : 0;
  const charCount = value ? value.length : 0;

  return (
    <div
      className={`flex flex-col rounded-2xl border border-slate-800 bg-[#07070f] overflow-hidden shadow-lg ${className}`}
    >
      {/* Formatting Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-2 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-sm select-none">
        <div className="flex flex-wrap items-center gap-1">
          {/* Text Style Group */}
          <button
            type="button"
            onClick={() => insertFormatting("**", "**", "bold text")}
            disabled={disabled || viewMode === "preview"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Bold (**text**)"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting("*", "*", "italic text")}
            disabled={disabled || viewMode === "preview"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Italic (*text*)"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting("~~", "~~", "strikethrough")}
            disabled={disabled || viewMode === "preview"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Strikethrough (~~text~~)"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </button>

          <span className="h-4 w-[1px] bg-slate-800 mx-1" />

          {/* Heading Group */}
          <button
            type="button"
            onClick={() => insertFormatting("# ", "", "Heading 1")}
            disabled={disabled || viewMode === "preview"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Heading 1 (# ...)"
          >
            <Heading1 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting("## ", "", "Heading 2")}
            disabled={disabled || viewMode === "preview"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Heading 2 (## ...)"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting("### ", "", "Heading 3")}
            disabled={disabled || viewMode === "preview"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Heading 3 (### ...)"
          >
            <Heading3 className="h-3.5 w-3.5" />
          </button>

          <span className="h-4 w-[1px] bg-slate-800 mx-1" />

          {/* Lists and Quotes */}
          <button
            type="button"
            onClick={() => insertFormatting("- ", "", "list item")}
            disabled={disabled || viewMode === "preview"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Bullet List (- item)"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting("1. ", "", "list item")}
            disabled={disabled || viewMode === "preview"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Numbered List (1. item)"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting("> ", "", "quote line")}
            disabled={disabled || viewMode === "preview"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Blockquote (> quote)"
          >
            <Quote className="h-3.5 w-3.5" />
          </button>

          <span className="h-4 w-[1px] bg-slate-800 mx-1" />

          {/* Code & Structures */}
          <button
            type="button"
            onClick={() => insertFormatting("`", "`", "variable")}
            disabled={disabled || viewMode === "preview"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Inline Code (`code`)"
          >
            <Code className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting("```json\n", "\n```", '{\n  "key": "value"\n}')}
            disabled={disabled || viewMode === "preview"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Code Block (```json ... ```)"
          >
            <FileCode className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting("| Header 1 | Header 2 |\n|---|---|\n| Value 1 | Value 2 |\n")}
            disabled={disabled || viewMode === "preview"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Markdown Table"
          >
            <Table className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting("[", "](https://example.com)", "link title")}
            disabled={disabled || viewMode === "preview"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Hyperlink [text](url)"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting("\n---\n")}
            disabled={disabled || viewMode === "preview"}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title="Horizontal Divider (---)"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* View Mode Controls & Utilities */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-slate-950/80 rounded-xl p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode("edit")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                viewMode === "edit"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Edit3 className="h-3 w-3" /> Edit
            </button>
            <button
              type="button"
              onClick={() => setViewMode("split")}
              className={`hidden md:flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                viewMode === "split"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Columns className="h-3 w-3" /> Split
            </button>
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                viewMode === "preview"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Eye className="h-3 w-3" /> Preview
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Copy Raw Markdown"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div
        className="flex-1 grid min-h-0 divide-x divide-slate-800"
        style={{
          gridTemplateColumns:
            viewMode === "split" ? "1fr 1fr" : "1fr",
          minHeight,
          maxHeight,
        }}
      >
        {/* Edit View */}
        {(viewMode === "edit" || viewMode === "split") && (
          <div className="relative flex-1 h-full min-h-0 bg-[#06060b]">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="w-full h-full p-4 bg-transparent text-xs text-slate-200 font-mono outline-none resize-none leading-relaxed [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800 overflow-y-auto"
            />
          </div>
        )}

        {/* Live Markdown Preview */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div className="flex-1 h-full min-h-0 p-5 bg-[#0a0a14] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800 text-slate-300 text-xs leading-relaxed space-y-3 prose prose-invert prose-xs max-w-none">
            {value.trim() ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ ...props }) => <h1 className="text-base font-bold text-white border-b border-slate-800 pb-1 mt-3 mb-2" {...props} />,
                  h2: ({ ...props }) => <h2 className="text-sm font-bold text-indigo-300 border-b border-slate-800/60 pb-1 mt-3 mb-1.5" {...props} />,
                  h3: ({ ...props }) => <h3 className="text-xs font-semibold text-slate-200 mt-2 mb-1" {...props} />,
                  p: ({ ...props }) => <p className="text-xs text-slate-300 leading-relaxed mb-2" {...props} />,
                  ul: ({ ...props }) => <ul className="list-disc pl-4 space-y-1 my-2" {...props} />,
                  ol: ({ ...props }) => <ol className="list-decimal pl-4 space-y-1 my-2" {...props} />,
                  li: ({ ...props }) => <li className="text-xs text-slate-300" {...props} />,
                  blockquote: ({ ...props }) => (
                    <blockquote className="border-l-2 border-indigo-500/50 pl-3 italic text-slate-400 my-2" {...props} />
                  ),
                  table: ({ ...props }) => (
                    <div className="overflow-x-auto my-3 border border-slate-800 rounded-xl">
                      <table className="w-full text-left text-xs divide-y divide-slate-800" {...props} />
                    </div>
                  ),
                  th: ({ ...props }) => <th className="px-3 py-2 bg-slate-900/80 font-bold text-slate-200" {...props} />,
                  td: ({ ...props }) => <td className="px-3 py-1.5 border-t border-slate-800/60 text-slate-300" {...props} />,
                  code: ({ className, children, ...props }) => {
                    const isInline = !className;
                    const codeStr = String(children);
                    // Highlight dynamic variables e.g. {weddingId}
                    if (isInline && /^\{[a-zA-Z0-9_]+\}$/.test(codeStr.trim())) {
                      return (
                        <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono text-[11px] font-bold">
                          {children}
                        </span>
                      );
                    }
                    if (isInline) {
                      return (
                        <code className="px-1.5 py-0.5 rounded bg-slate-900 text-cyan-300 font-mono text-[11px] border border-slate-800" {...props}>
                          {children}
                        </code>
                      );
                    }
                    return (
                      <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto my-2">
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </pre>
                    );
                  },
                }}
              >
                {value}
              </ReactMarkdown>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-slate-600 text-xs italic">
                Markdown preview will appear here as you type...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-800/80 bg-slate-950/80 text-[10px] font-mono text-slate-500 select-none">
        <div className="flex items-center gap-3">
          <span>{charCount} characters</span>
          <span>&middot;</span>
          <span>{lineCount} lines</span>
        </div>
        <div className="flex items-center gap-1.5 text-indigo-400">
          <Sparkles className="h-3 w-3" />
          <span>Markdown WYSIWYG Ready</span>
        </div>
      </div>
    </div>
  );
}
