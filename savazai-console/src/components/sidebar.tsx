"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Settings,
  LogOut,
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
  BookOpen,
  CalendarCheck,
  User,
  ShieldCheck,
  Scale,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { usePermissions } from "@/lib/auth/use-permissions";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { href: "/dashboard", label: "Agent Workspace", icon: LayoutDashboard },
  { href: "/studio", label: "Capability Studio", icon: BrainCircuit },
  { href: "/business", label: "Business Center", icon: Library },
  { href: "/docs", label: "Documentation", icon: BookOpen },
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
  const { hasPermission, hasAnyCategoryView, user } = usePermissions();
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
  const [platformTitle, setPlatformTitle] = useState("SavazAI");
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const isDashboard = pathname === "/dashboard";

  // Dynamic Platform Brand & Header Identity
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.appTitle) {
          setPlatformTitle(data.appTitle);
          if (typeof document !== "undefined") {
            document.title = `${data.appTitle} Console`;
          }
        }
        if (data?.brandLogoUrl) setBrandLogoUrl(data.brandLogoUrl);
      })
      .catch(() => {});

    const handleBranding = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.appTitle) {
        setPlatformTitle(detail.appTitle);
        if (typeof document !== "undefined") {
          document.title = `${detail.appTitle} Console`;
        }
      }
      if (detail?.brandLogoUrl !== undefined) setBrandLogoUrl(detail.brandLogoUrl || null);
    };
    window.addEventListener("savazai-branding-updated", handleBranding);
    return () => window.removeEventListener("savazai-branding-updated", handleBranding);
  }, []);

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

  const isSuperAdmin =
    user?.role === "admin" ||
    user?.roleName === "Super Administrator" ||
    user?.roleNames?.includes("Super Administrator") ||
    session?.user?.role === "admin";

  const canViewWorkspace = hasPermission("agent_workspace", "view") && showAgentWorkspace;
  const canViewStudio = hasPermission("capability_studio", "view");
  const canViewBusiness = hasAnyCategoryView("business_center");
  const canViewCommandCenter = hasAnyCategoryView("command_center");
  const canViewSystemAdmin =
    hasPermission("system_admin", "view") ||
    hasPermission("command_center", "system_admin_view") ||
    hasPermission("appearance", "update") ||
    hasPermission("branding", "update");
  const canViewUserAdmin = hasPermission("user_admin", "view");
  const canViewGovernance =
    hasPermission("governance", "view") ||
    isSuperAdmin ||
    user?.roleNames?.includes("Auditor") ||
    user?.roleNames?.includes("User Administrator");

  const canViewDocs = hasPermission("documentation", "view");
  const canViewDemoRequests = hasPermission("demo_requests", "view") && isSuperAdmin;

  // 1. Core Operational Modules (Top)
  const coreNavItems = [
    ...(canViewWorkspace ? [{ href: "/dashboard", label: "Agent Workspace", icon: LayoutDashboard }] : []),
    ...(canViewStudio ? [{ href: "/studio", label: "Capability Studio", icon: BrainCircuit }] : []),
    ...(canViewBusiness ? [{ href: "/business", label: "Business Center", icon: Library }] : []),
    ...(canViewCommandCenter ? [{ href: "/admin/settings", label: "Command Center", icon: Settings }] : []),
    ...(canViewSystemAdmin ? [{ href: "/admin/system", label: "System Admin", icon: ShieldCheck }] : []),
    ...(canViewUserAdmin ? [{ href: "/admin/users", label: "User Admin", icon: Users }] : []),
    ...(canViewGovernance ? [{ href: "/admin/governance", label: "Governance", icon: Scale }] : []),
  ];

  // 2. Secondary Utility Items (Bottom, directly above Dark/Light Mode switch)
  const utilityNavItems = [
    ...(canViewDocs ? [{ href: "/docs", label: "Documentation", icon: BookOpen }] : []),
    ...(canViewDemoRequests ? [{ href: "/admin/demo-requests", label: "Demo Requests", icon: CalendarCheck }] : []),
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
    <div className="flex flex-col h-full overflow-y-auto select-none bg-card text-card-foreground">
      <div className="flex items-center justify-between px-4 py-6 border-b border-border">
        <div className="flex items-center gap-3">
          {brandLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={brandLogoUrl}
              alt={platformTitle}
              className="h-7 w-auto max-w-[140px] max-h-[30px] object-contain shrink-0"
              onError={() => setBrandLogoUrl(null)}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src="/savazar-logo.png"
              alt={platformTitle}
              className="h-7 w-7 rounded-lg object-contain shrink-0 shadow-xs border border-border"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          {showFullContent && (
            <span className="text-lg font-bold text-foreground tracking-tight animate-in fade-in duration-200 truncate max-w-[140px]">
              {platformTitle}
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
            className="hidden md:flex p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav className="px-2 pt-4 pb-2 space-y-1">
        {coreNavItems.map((item) => {
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
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
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
        <div className="flex flex-col flex-1 min-h-0 border-t border-border pt-3">
          <div className="flex items-center justify-between px-3 mb-2 shrink-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Chat Conversations
            </span>
            <button
              onClick={handleNewChat}
              className="flex items-center justify-center w-6 h-6 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
              title="New Chat"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 space-y-1">
            {threads.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-6">
                No conversations yet
              </p>
            ) : (
              threads.map((t) => (
                <div
                  key={t.threadId}
                  onClick={() => window.dispatchEvent(new CustomEvent("savazai-select-thread", { detail: { threadId: t.threadId } }))}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-xl transition-all cursor-pointer ${
                    activeThreadId === t.threadId
                      ? "bg-primary/10 border border-primary/20 text-primary font-medium"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-xs transition-colors">
                    {t.title}
                  </span>
                  <button
                    onClick={(e) => handleDeleteThread(e, t.threadId)}
                    className="shrink-0 p-0.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-all"
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

      <div className="px-2 py-3 border-t border-border shrink-0 space-y-1">
        {utilityNavItems.length > 0 && (
          <div className="pb-1 mb-1 border-b border-border/50 space-y-1">
            {utilityNavItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-xl text-xs font-semibold transition-all ${
                    !showFullContent ? "justify-center p-2.5 mx-2" : "w-full px-3 py-2"
                  } ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
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
          </div>
        )}

        <ThemeToggle compact={!showFullContent} className={`flex items-center gap-3 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all ${!showFullContent ? "justify-center p-2.5 mx-2" : "w-full px-3 py-2"}`} />

        <Link
          href="/profile"
          className={`flex items-center gap-3 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all ${
            pathname === "/profile" ? "bg-primary/10 text-primary border border-primary/20 font-medium" : ""
          } ${
            !showFullContent ? "justify-center p-2.5 mx-2" : "w-full px-3 py-2"
          }`}
          title={!showFullContent ? (session?.user?.name || "My Profile") : undefined}
        >
          <div className="h-6 w-6 rounded-lg bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
            {session?.user?.image ? (
              <img src={session.user.image} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              session?.user?.name?.charAt(0).toUpperCase() || <User className="h-3.5 w-3.5" />
            )}
          </div>
          {showFullContent && (
            <div className="flex-1 truncate text-left animate-in fade-in duration-200">
              <div className="truncate text-foreground font-medium text-xs">{session?.user?.name || "My Profile"}</div>
              <div className="text-[10px] text-muted-foreground truncate">Account &amp; Security</div>
            </div>
          )}
        </Link>

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
          className={`flex items-center gap-3 rounded-xl text-xs font-semibold text-destructive hover:bg-destructive/10 transition-all ${
            !showFullContent ? "justify-center p-2.5 mx-2" : "w-full px-3 py-2"
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
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-xl bg-card border border-border text-foreground hover:bg-muted shadow-lg shadow-black/10"
        aria-label="Toggle sidebar"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-border bg-card transition-all duration-300 ${
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
          <aside className="relative w-60 max-w-[75vw] bg-card border-r border-border shadow-2xl flex flex-col h-full animate-in slide-in-from-left duration-250">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
