"use client";

import React from "react";
import { Bot, User, Loader2 } from "lucide-react";

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

function renderParsedContent(content: string) {
  const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  imgRegex.lastIndex = 0;

  while ((match = imgRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      elements.push(
        <span key={`text-${key++}`} className="whitespace-pre-wrap break-words">
          {textBefore}
        </span>
      );
    }

    const alt = match[1];
    const src = match[2];

    elements.push(
      <div key={`img-${key++}`} className="my-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40 p-1 shadow-md max-w-md">
        <img
          src={src}
          alt={alt || "Image Asset"}
          className="w-full h-auto object-cover rounded-lg"
          loading="lazy"
        />
      </div>
    );

    lastIndex = imgRegex.lastIndex;
  }

  const textAfter = content.substring(lastIndex);
  if (textAfter) {
    elements.push(
      <span key={`text-${key++}`} className="whitespace-pre-wrap break-words">
        {textAfter}
      </span>
    );
  }

  return elements;
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
          {renderParsedContent(message.content)}
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
