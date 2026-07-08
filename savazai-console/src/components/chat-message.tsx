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
        <p className="whitespace-pre-wrap break-words">
          {message.content}
          {isStreaming && (
            <Loader2 className="inline h-3.5 w-3.5 ml-1 animate-spin text-slate-400" />
          )}
        </p>
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
