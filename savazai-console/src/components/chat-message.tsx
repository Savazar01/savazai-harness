"use client";

import React from "react";
import { Bot, User, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

const markdownComponents = {
  // Custom Table rendering
  table: ({ children, ...props }: React.ComponentPropsWithoutRef<"table">) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/10 shadow-sm">
      <table className="min-w-full divide-y divide-slate-800 text-xs" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: React.ComponentPropsWithoutRef<"thead">) => (
    <thead className="bg-slate-900/40" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }: React.ComponentPropsWithoutRef<"tbody">) => (
    <tbody className="divide-y divide-slate-800" {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }: React.ComponentPropsWithoutRef<"tr">) => (
    <tr className="hover:bg-slate-900/10 transition-colors" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }: React.ComponentPropsWithoutRef<"th">) => (
    <th className="px-4 py-2.5 text-left font-medium text-slate-400 uppercase tracking-wider" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }: React.ComponentPropsWithoutRef<"td">) => (
    <td className="px-4 py-2 text-slate-300" {...props}>
      {children}
    </td>
  ),
  // Custom list rendering
  ul: ({ children, ...props }: React.ComponentPropsWithoutRef<"ul">) => (
    <ul className="list-disc list-outside my-2 pl-5 text-slate-300 space-y-1" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: React.ComponentPropsWithoutRef<"ol">) => (
    <ol className="list-decimal list-outside my-2 pl-5 text-slate-300 space-y-1" {...props}>
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
    <div className="my-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40 p-1 shadow-md max-w-md">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || "Visual Asset"}
        className="w-full h-auto object-cover rounded-lg"
        loading="lazy"
        {...props}
      />
    </div>
  ),
  // Bold
  strong: ({ children, ...props }: React.ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-white" {...props}>
      {children}
    </strong>
  ),
  // Inline Code
  code: ({ children, ...props }: React.ComponentPropsWithoutRef<"code">) => (
    <code className="px-1.5 py-0.5 rounded bg-slate-950/60 text-cyan-400 font-mono text-xs" {...props}>
      {children}
    </code>
  ),
  // Paragraph
  p: ({ children, ...props }: React.ComponentPropsWithoutRef<"p">) => (
    <p className="leading-relaxed text-slate-300 my-1" {...props}>
      {children}
    </p>
  ),
};

function parseMarkdownToReact(content: string): React.ReactNode {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  );
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
          isUser
            ? "bg-primary/15 text-primary"
            : "bg-cyan-500/10 text-cyan-400"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-white rounded-tr-md"
            : "bg-slate-900/60 border border-slate-900 text-slate-200 rounded-tl-md"
        }`}
      >
        <div className="flex flex-col gap-1">
          {parseMarkdownToReact(message.content)}
          {isStreaming && (
            <Loader2 className="inline h-3.5 w-3.5 ml-1 animate-spin text-slate-400 mt-1" />
          )}
        </div>
        <span
          className={`block mt-1.5 text-[10px] opacity-50 ${
            isUser ? "text-white/60" : "text-slate-500"
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
