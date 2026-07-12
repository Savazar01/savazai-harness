"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Settings,
  LogOut,
  Bot,
  Menu,
  X,
  Plus,
  Trash2,
  MessageSquare,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";

const navItems = [
  { href: "/dashboard", label: "Agent Workspace", icon: LayoutDashboard },
  { href: "/admin/settings", label: "Command Center", icon: Settings },
];

export interface ChatThread {
  threadId: string;
  title: string;
  createdAt: string;
}

const STORAGE_KEY = "savazai_chat_threads";

function loadThreads(): ChatThread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveThreads(threads: ChatThread[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch {}
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [threads, setThreads] = useState<ChatThread[]>(() => loadThreads());
  const isDashboard = pathname === "/dashboard";

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.threadId) {
        setThreads((prev) => {
          const existing = prev.find((t) => t.threadId === detail.threadId);
          if (existing) {
            const next = prev.map((t) =>
              t.threadId === detail.threadId ? { ...t, title: detail.title || t.title } : t
            );
            saveThreads(next);
            return next;
          }
          const next = [{ threadId: detail.threadId, title: detail.title || "New Chat", createdAt: detail.createdAt || new Date().toISOString() }, ...prev];
          saveThreads(next);
          return next;
        });
      }
    };
    window.addEventListener("savazai-thread-created", handler);
    return () => window.removeEventListener("savazai-thread-created", handler);
  }, []);

  const handleNewChat = useCallback(() => {
    const threadId = `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    window.dispatchEvent(new CustomEvent("savazai-new-chat", { detail: { threadId } }));
  }, []);

  const handleDeleteThread = useCallback((e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setThreads((prev) => {
      const next = prev.filter((t) => t.threadId !== threadId);
      saveThreads(next);
      return next;
    });
  }, []);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-6 border-b border-slate-900">
        <Bot className="h-7 w-7 text-primary" />
        <span className="text-lg font-bold text-white tracking-tight">
          SavazAI
        </span>
      </div>

      <nav className="px-3 pt-4 pb-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isActive
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/40"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {isDashboard && (
        <div className="flex flex-col flex-1 min-h-0 border-t border-slate-900 pt-3">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Chat Conversations
            </span>
            <button
              onClick={handleNewChat}
              className="flex items-center justify-center w-6 h-6 rounded-lg hover:bg-slate-800/60 text-slate-400 hover:text-white transition-all"
              title="New Chat"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 space-y-1">
            {threads.length === 0 ? (
              <p className="text-[11px] text-slate-600 text-center py-6">
                No conversations yet
              </p>
            ) : (
              threads.map((t) => (
                <div
                  key={t.threadId}
                  className="group flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-slate-900/40 transition-all cursor-pointer"
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="flex-1 truncate text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
                    {t.title}
                  </span>
                  <button
                    onClick={(e) => handleDeleteThread(e, t.threadId)}
                    className="shrink-0 p-0.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-all"
                    title="Delete conversation"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="px-3 py-4 border-t border-slate-900">
        <button
          onClick={async () => {
            try {
              await authClient.signOut({
                fetchOptions: {
                  onSuccess: () => router.push("/"),
                },
              });
            } catch (err) {
              console.error("[sidebar] Sign out failed:", err);
            }
          }}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300"
        aria-label="Toggle sidebar"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-slate-900 bg-slate-950/60">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-60 max-w-[75vw] bg-slate-950 border-r border-slate-900 shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
