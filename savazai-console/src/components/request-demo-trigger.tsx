"use client";

import React, { useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { DemoRequestModal } from "@/components/demo-request-modal";

interface RequestDemoTriggerProps {
  variant?: "header" | "hero";
  className?: string;
  children?: React.ReactNode;
}

export function RequestDemoTrigger({ variant = "hero", className, children }: RequestDemoTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (children) {
    return (
      <>
        <button type="button" onClick={() => setIsOpen(true)} className={className}>
          {children}
        </button>
        <DemoRequestModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </>
    );
  }

  if (variant === "header") {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={className || "rounded-full bg-primary/20 border border-primary/40 px-5 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-white shadow-md transition-all hover:scale-[1.02]"}
        >
          Request Demo
        </button>
        <DemoRequestModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={className || "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-semibold text-white shadow-xl shadow-primary/20 hover:bg-primary/95 transition-all hover:scale-[1.02]"}
      >
        <Sparkles className="h-5 w-5 text-white" />
        Request Demo
        <ArrowRight className="h-5 w-5" />
      </button>
      <DemoRequestModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
