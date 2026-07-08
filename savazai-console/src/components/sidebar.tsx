"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Settings,
  LogOut,
  Bot,
  Menu,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";

const navItems = [
  { href: "/dashboard", label: "Agent Workspace", icon: LayoutDashboard },
  { href: "/admin/settings", label: "Command Center", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const handleSignOut = async () => {
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => router.push("/"),
        },
      });
    } catch (err) {
      console.error("[sidebar] Sign out failed:", err);
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-6 border-b border-slate-900">
        <Bot className="h-7 w-7 text-primary" />
        <span className="text-lg font-bold text-white tracking-tight">
          SavazAI
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
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

      <div className="px-3 py-4 border-t border-slate-900">
        <button
          onClick={handleSignOut}
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
