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
  BrainCircuit,
  Library,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";

const navItems = [
  { href: "/dashboard", label: "Agent Workspace", icon: LayoutDashboard },
  { href: "/studio", label: "Capability Studio", icon: BrainCircuit },
  { href: "/business", label: "Business Center", icon: Library },
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
  const { data: session } = authClient.useSession();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [threads, setThreads] = useState<ChatThread[]>(() => loadThreads());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAgentWorkspace, setShowAgentWorkspace] = useState(() => {
    if (typeof window !== "undefined") {
      const persisted = localStorage.getItem("savazai_show_agent_workspace");
      if (persisted !== null) return persisted === "true";
    }
    return true;
  });
  const isDashboard = pathname === "/dashboard";

  // Persistent sidebar state & window resize listener
  useEffect(() => {
    if (typeof window !== "undefined") {
      const persisted = localStorage.getItem("savazai_sidebar_collapsed");
      // Default to collapsed on tablet resolutions, read localStorage on desktop
      const handleResize = () => {
        const width = window.innerWidth;
        if (width >= 768 && width <= 1024) {
          setIsCollapsed(true);
        } else if (width > 1024) {
          setIsCollapsed(persisted === "true");
        } else {
          // Mobile state uses full drawer model
          setIsCollapsed(false);
        }
      };

      handleResize();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);

  useEffect(() => {
    const handleAppearance = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.showAgentWorkspace !== undefined) {
        setShowAgentWorkspace(detail.showAgentWorkspace);
      }
    };
    window.addEventListener("savazai-appearance-updated", handleAppearance);
    return () => window.removeEventListener("savazai-appearance-updated", handleAppearance);
  }, []);

  const activeNavItems = [
    ...(showAgentWorkspace ? [{ href: "/dashboard", label: "Agent Workspace", icon: LayoutDashboard }] : []),
    { href: "/studio", label: "Capability Studio", icon: BrainCircuit },
    { href: "/business", label: "Business Center", icon: Library },
    ...(session?.user?.role === "admin"
      ? [
          { href: "/admin/settings", label: "Command Center", icon: Settings },
          { href: "/admin/users", label: "User Admin", icon: Users },
        ]
      : []),
  ];

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

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.threadId) {
        setActiveThreadId(detail.threadId);
      }
    };
    window.addEventListener("savazai-thread-activated", handler);
    return () => window.removeEventListener("savazai-thread-activated", handler);
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveThreadId(null);
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

  // Determine if full labels and chat components are rendered
  const showFullContent = !isCollapsed || mobileOpen;

  const sidebarContent = (
    <div className="flex flex-col h-full overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-900 select-none">
      <div className="flex items-center justify-between px-4 py-6 border-b border-slate-900">
        <div className="flex items-center gap-3">
          <Bot className="h-7 w-7 text-primary shrink-0" />
          {showFullContent && (
            <span className="text-lg font-bold text-white tracking-tight animate-in fade-in duration-200">
              SavazAI
            </span>
          )}
        </div>
        {!mobileOpen && (
          <button
            onClick={() => {
              const nextVal = !isCollapsed;
              setIsCollapsed(nextVal);
              localStorage.setItem("savazai_sidebar_collapsed", String(nextVal));
            }}
            className="hidden md:flex p-1 rounded hover:bg-slate-900 text-slate-400 hover:text-white transition-colors"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav className="px-2 pt-4 pb-2 space-y-1">
        {activeNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-xl text-sm font-semibold transition-all ${
                !showFullContent ? "justify-center p-2.5 mx-2" : "px-3 py-2.5"
              } ${
                isActive
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/40"
              }`}
              title={!showFullContent ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {showFullContent && (
                <span className="animate-in fade-in duration-200">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {isDashboard && showFullContent && (
        <div className="flex flex-col flex-1 min-h-0 border-t border-slate-900 pt-3">
          <div className="flex items-center justify-between px-3 mb-2 shrink-0">
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
          <div className="flex-1 overflow-y-auto px-2 space-y-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-900">
            {threads.length === 0 ? (
              <p className="text-[11px] text-slate-600 text-center py-6">
                No conversations yet
              </p>
            ) : (
              threads.map((t) => (
                <div
                  key={t.threadId}
                  onClick={() => window.dispatchEvent(new CustomEvent("savazai-select-thread", { detail: { threadId: t.threadId } }))}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-xl transition-all cursor-pointer ${
                    activeThreadId === t.threadId
                      ? "bg-indigo-500/10 border border-indigo-500/20"
                      : "hover:bg-slate-900/40"
                  }`}
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

      {/* Spacer to push signout down if dashboard is not active */}
      {!isDashboard && <div className="flex-1" />}

      <div className="px-2 py-4 border-t border-slate-900 shrink-0">
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
          className={`flex items-center gap-3 rounded-xl text-sm font-semibold text-red-400 hover:bg-red-500/10 transition-all ${
            !showFullContent ? "justify-center p-2.5 mx-2" : "w-full px-3 py-2.5"
          }`}
          title={!showFullContent ? "Sign Out" : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {showFullContent && (
            <span className="animate-in fade-in duration-200">Sign Out</span>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Menu trigger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-350 hover:text-white shadow-lg shadow-black/40"
        aria-label="Toggle sidebar"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-slate-900 bg-slate-950/60 transition-all duration-300 ${
          isCollapsed ? "w-16" : "w-60"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-60 max-w-[75vw] bg-slate-950 border-r border-slate-900 shadow-2xl flex flex-col h-full animate-in slide-in-from-left duration-250">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
