"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export interface ClientThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: string;
}

export function ClientThemeProvider({
  children,
  defaultTheme = "dark",
}: ClientThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem={false}
      disableTransitionOnChange={false}
    >
      <TooltipProvider delayDuration={150}>
        {children}
        <Toaster richColors closeButton position="top-right" />
      </TooltipProvider>
    </NextThemesProvider>
  );
}
