"use client";

import React, { useState } from "react";
import { Bot, User, Loader2, Download, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { triggerCsvDownload, extractMarkdownTableToCsv } from "@/components/studio/test-sandbox";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

interface ChatMessageProps {
  message: ChatMessageData;
  isStreaming?: boolean;
}

function ChatReportToolbar({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const csvMatch = content.match(/data:text\/csv;charset=utf-8;base64,[A-Za-z0-9+/=]+/) || content.match(/data:text\/csv;[^\s>)]+/i);
  const tableCsv = extractMarkdownTableToCsv(content);
  const hasTableOrCsv = Boolean(tableCsv || csvMatch);

  if (!hasTableOrCsv) return null;

  const fileMatch = content.match(/\(([^)]+\.csv)\)/i) || content.match(/([a-zA-Z0-9_-]+\.csv)/i);
  const rawFilename = fileMatch ? fileMatch[1] : "export.csv";
  const downloadFilename = rawFilename.replace(/\.csv$/i, "").replace(/_csv$/i, "").replace(/_+$/, "") + ".csv";

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (csvMatch) {
      triggerCsvDownload(csvMatch[0], downloadFilename);
    } else if (tableCsv) {
      triggerCsvDownload(tableCsv, downloadFilename);
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const textToCopy = tableCsv || content;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy table:", err);
    }
  };

  return (
    <div className="mt-3 pt-2.5 border-t border-border flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleDownload}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 font-semibold text-xs hover:bg-emerald-500/25 transition-all cursor-pointer shadow-xs active:scale-95"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Download CSV ({downloadFilename})</span>
      </button>

      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border text-foreground font-medium text-xs hover:bg-accent transition-all cursor-pointer shadow-xs active:scale-95"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        <span>{copied ? "Copied to Clipboard!" : "Copy Table"}</span>
      </button>
    </div>
  );
}

const markdownComponents = {
  // Custom Table rendering
  table: ({ children, ...props }: React.ComponentPropsWithoutRef<"table">) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
      <table className="min-w-full divide-y divide-border text-xs" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: React.ComponentPropsWithoutRef<"thead">) => (
    <thead className="bg-muted/50 border-b border-border" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }: React.ComponentPropsWithoutRef<"tbody">) => (
    <tbody className="divide-y divide-border" {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }: React.ComponentPropsWithoutRef<"tr">) => (
    <tr className="hover:bg-muted/30 transition-colors" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }: React.ComponentPropsWithoutRef<"th">) => (
    <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider text-[11px]" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }: React.ComponentPropsWithoutRef<"td">) => (
    <td className="px-4 py-2 text-card-foreground/90" {...props}>
      {children}
    </td>
  ),
  // Custom list rendering
  ul: ({ children, ...props }: React.ComponentPropsWithoutRef<"ul">) => (
    <ul className="list-disc list-outside my-2 pl-5 text-card-foreground/90 space-y-1" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: React.ComponentPropsWithoutRef<"ol">) => (
    <ol className="list-decimal list-outside my-2 pl-5 text-card-foreground/90 space-y-1" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }: React.ComponentPropsWithoutRef<"li">) => (
    <li className="leading-relaxed" {...props}>
      {children}
    </li>
  ),
  // Custom Image rendering
  img: ({ src, alt, ...props }: React.ComponentPropsWithoutRef<"img">) => (
    <div className="my-3 overflow-hidden rounded-xl border border-border bg-muted/20">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || "Generated content"}
        className="max-h-96 w-full object-contain"
        loading="lazy"
        {...props}
      />
      {alt && (
        <div className="bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground border-t border-border">
          {alt}
        </div>
      )}
    </div>
  ),
  // Code block
  code: ({ children, ...props }: React.ComponentPropsWithoutRef<"code">) => (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary border border-border/50" {...props}>
      {children}
    </code>
  ),
  // Blockquote
  blockquote: ({ children, ...props }: React.ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote className="border-l-2 border-primary/50 pl-3 italic text-muted-foreground my-2" {...props}>
      {children}
    </blockquote>
  ),
  // Headers
  h1: ({ children, ...props }: React.ComponentPropsWithoutRef<"h1">) => (
    <h1 className="text-lg font-bold text-card-foreground mt-4 mb-2 first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: React.ComponentPropsWithoutRef<"h2">) => (
    <h2 className="text-base font-bold text-card-foreground mt-3 mb-1.5 first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: React.ComponentPropsWithoutRef<"h3">) => (
    <h3 className="text-sm font-semibold text-card-foreground mt-2 mb-1 first:mt-0" {...props}>
      {children}
    </h3>
  ),
  // Paragraph
  p: ({ children, ...props }: React.ComponentPropsWithoutRef<"p">) => (
    <p className="leading-relaxed text-card-foreground/90 my-1" {...props}>
      {children}
    </p>
  ),
  // Links & Data URI Downloads
  a: ({ href, children, ...props }: React.ComponentPropsWithoutRef<"a">) => {
    if (!href) return <span {...props}>{children}</span>;

    // 1. Data URI Downloads
    if (href.startsWith("data:text/csv") || href.startsWith("data:application/pdf") || href.startsWith("data:text/html") || href.startsWith("data:") || href.includes("data:text/csv")) {
      const isCsv = href.includes("data:text/csv");
      const isPdf = href.includes("data:application/pdf");
      let downloadFilename = isCsv ? "export.csv" : (isPdf ? "report.pdf" : "download.dat");
      const childStr = Array.isArray(children) ? children.join(" ") : String(children || "");
      const fileMatch = childStr.match(/\(([^)]+\.(?:csv|pdf|html|txt))\)/i) || childStr.match(/([a-zA-Z0-9_-]+\.(?:csv|pdf|html|txt))/i);
      if (fileMatch && fileMatch[1]) {
        downloadFilename = fileMatch[1];
      }
      const cleanName = downloadFilename.replace(/\.csv$/i, "").replace(/_csv$/i, "").replace(/_+$/, "") + (isCsv ? ".csv" : "");

      return (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            triggerCsvDownload(href, cleanName);
          }}
          className="inline-flex items-center gap-1.5 my-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold text-xs hover:bg-emerald-500/25 hover:text-emerald-200 transition-all cursor-pointer shadow-sm active:scale-95"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{children}</span>
        </button>
      );
    }

    // 2. Telephone tel: links
    if (href.startsWith("tel:")) {
      return (
        <a
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="text-cyan-400 hover:text-cyan-300 font-medium underline underline-offset-2 transition-colors"
        >
          {children}
        </a>
      );
    }

    // 3. Email mailto: links
    if (href.startsWith("mailto:")) {
      return (
        <a
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2 transition-colors"
        >
          {children}
        </a>
      );
    }

    // 4. Default links
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-emerald-400 hover:text-emerald-300 font-medium underline underline-offset-2 transition-colors"
      >
        {children}
      </a>
    );
  },
};

function parseMarkdownToReact(content: string): React.ReactNode {
  return (
    <ReactMarkdown
      urlTransform={(url) => url}
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  if (message.role === "system") {
    return (
      <div className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted/60 border border-border text-xs text-muted-foreground font-mono my-2 shadow-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary shrink-0">
          <Bot className="h-3.5 w-3.5" />
        </div>
        <span className="flex-1 leading-normal text-foreground">{message.content}</span>
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
          isUser
            ? "bg-primary/15 text-primary"
            : "bg-secondary/15 text-secondary"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-md shadow-sm"
            : "bg-card border border-border text-card-foreground rounded-tl-md shadow-xs"
        }`}
      >
        <div className="flex flex-col gap-1">
          {parseMarkdownToReact(message.content)}
          {isStreaming && (
            <Loader2 className="inline h-3.5 w-3.5 ml-1 animate-spin text-muted-foreground mt-1" />
          )}

          {!isUser && <ChatReportToolbar content={message.content} />}
        </div>
        <span
          className={`block mt-1.5 text-[10px] ${
            isUser ? "text-primary-foreground/70" : "text-muted-foreground"
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
