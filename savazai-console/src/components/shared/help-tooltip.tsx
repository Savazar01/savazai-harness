"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

interface HelpTooltipProps {
  content: string;
  side?: "top" | "bottom" | "left" | "right";
}

type Side = "top" | "bottom" | "left" | "right";

const GAP = 8;
const ESTIMATED_TIP_W = 280;
const ESTIMATED_TIP_H = 80;

function computePosition(
  btnRect: DOMRect,
  tipW: number,
  tipH: number,
  preferred: Side,
): { side: Side; top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let side = preferred;

  const fits = (s: Side): boolean => {
    switch (s) {
      case "top":    return btnRect.top - tipH - GAP >= 0;
      case "bottom": return btnRect.bottom + tipH + GAP <= vh;
      case "left":   return btnRect.left - tipW - GAP >= 0;
      case "right":  return btnRect.right + tipW + GAP <= vw;
    }
  };

  if (!fits(side)) {
    const fallbacks: Record<Side, Side[]> = {
      top:    ["bottom", "right", "left"],
      bottom: ["top", "right", "left"],
      left:   ["right", "top", "bottom"],
      right:  ["left", "top", "bottom"],
    };
    for (const f of fallbacks[side]) {
      if (fits(f)) { side = f; break; }
    }
  }

  let top: number;
  let left: number;

  switch (side) {
    case "top":
      top  = btnRect.top - tipH - GAP;
      left = btnRect.left + btnRect.width / 2 - tipW / 2;
      break;
    case "bottom":
      top  = btnRect.bottom + GAP;
      left = btnRect.left + btnRect.width / 2 - tipW / 2;
      break;
    case "left":
      top  = btnRect.top + btnRect.height / 2 - tipH / 2;
      left = btnRect.left - tipW - GAP;
      break;
    case "right":
      top  = btnRect.top + btnRect.height / 2 - tipH / 2;
      left = btnRect.right + GAP;
      break;
  }

  top  = Math.max(GAP, Math.min(top,  vh - tipH - GAP));
  left = Math.max(GAP, Math.min(left, vw - tipW - GAP));

  return { side, top, left };
}

const arrowClass: Record<Side, string> = {
  top:    "bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-700",
  bottom: "top-0 left-1/2 -translate-x-1/2 -translate-y-full border-l-4 border-r-4 border-b-4 border-transparent border-b-slate-700",
  left:   "right-0 top-1/2 -translate-y-1/2 translate-x-full border-t-4 border-b-4 border-l-4 border-transparent border-l-slate-700",
  right:  "left-0 top-1/2 -translate-y-1/2 -translate-x-full border-t-4 border-b-4 border-r-4 border-transparent border-r-slate-700",
};

export function HelpTooltip({ content, side = "top" }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ side: Side; top: number; left: number } | null>(null);
  const openRef = useRef(false);
  const sideRef = useRef<Side>(side);

  const refinePosition = useCallback(() => {
    if (!btnRef.current || !tipRef.current) return;
    const currSide = sideRef.current;
    const { side: s, top, left } = computePosition(
      btnRef.current.getBoundingClientRect(),
      tipRef.current.offsetWidth,
      tipRef.current.offsetHeight,
      currSide,
    );
    sideRef.current = s;
    setPos({ side: s, top, left });
  }, []);

  const doOpen = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p = computePosition(r, ESTIMATED_TIP_W, ESTIMATED_TIP_H, side);
    sideRef.current = p.side;
    setPos(p);
    openRef.current = true;
    setOpen(true);
  }, [side]);

  const doClose = useCallback(() => {
    openRef.current = false;
    setOpen(false);
    setPos(null);
  }, []);

  // Refine position once portal DOM is measurable.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => refinePosition());
    return () => cancelAnimationFrame(raf);
  }, [open, refinePosition]);

  // Re-position on scroll / resize while open.
  useEffect(() => {
    if (!open) return;
    const handle = () => {
      if (!openRef.current || !btnRef.current) return;
      const p = computePosition(
        btnRef.current.getBoundingClientRect(),
        ESTIMATED_TIP_W,
        ESTIMATED_TIP_H,
        sideRef.current,
      );
      sideRef.current = p.side;
      setPos(p);
    };
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [open]);

  return (
    <span className="inline-flex items-center shrink-0">
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={doOpen}
        onMouseLeave={doClose}
        onClick={(e) => {
          if (open) { doClose(); return; }
          doOpen(e);
        }}
        className="inline-flex items-center justify-center h-4 w-4 rounded-full border border-slate-700 bg-slate-900/50 text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-all cursor-help text-[9px] font-bold leading-none"
        aria-label="Help"
      >
        ?
      </button>
      {open && pos && createPortal(
        <div
          ref={tipRef}
          className="min-w-[240px] max-w-[320px] opacity-100 visible z-[999999]"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            pointerEvents: "none",
          }}
        >
          <div className="relative bg-slate-900 border border-slate-700 shadow-2xl p-3 rounded-lg text-xs text-slate-200 leading-relaxed break-words">
            <p className="break-words">{content}</p>
            <div className={`absolute ${arrowClass[pos.side]}`} />
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
