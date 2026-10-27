"use client";

import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("savazai_theme_mode");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(saved);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initial = prefersDark ? "dark" : "light";
      setTheme(initial);
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(initial);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("savazai_theme_mode", next);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    window.dispatchEvent(new CustomEvent("savazai-theme-changed", { detail: { theme: next } }));
  };

  if (!mounted) {
    return (
      <div className={className || "h-8 w-8 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse"} />
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={
        className ||
        "flex items-center gap-2 p-2 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer shadow-sm"
      }
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label="Toggle Theme"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 text-amber-400 shrink-0 transition-transform hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 text-indigo-400 shrink-0 transition-transform hover:-rotate-12" />
      )}
      {!compact && (
        <span className="text-xs font-medium text-slate-300 hover:text-white">
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </span>
      )}
    </button>
  );
}
