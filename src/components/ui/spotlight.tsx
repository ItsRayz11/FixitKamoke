"use client";

import { useRef, type ReactNode } from "react";

/**
 * Titanium Spotlight: a restrained pointer-driven tilt (max ~5°) with a soft glare that follows the cursor.
 * Only active on devices with a hover-capable fine pointer (desktop). On phones and with reduced motion the
 * surface stays static, so touch scrolling and battery are untouched. Pure CSS variables, no layout work per move.
 */
export function Spotlight({ children, className = "", max = 5 }: { children: ReactNode; className?: string; max?: number }) {
  const root = useRef<HTMLDivElement>(null);
  const canTilt = () => typeof window !== "undefined"
    && window.matchMedia("(hover: hover) and (pointer: fine)").matches
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function move(e: React.PointerEvent<HTMLDivElement>) {
    const el = root.current;
    if (!el || e.pointerType !== "mouse" || !canTilt()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    el.dataset.active = "true";
  }
  function leave() {
    const el = root.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.dataset.active = "false";
  }
  return (
    <div ref={root} className={`spotlight ${className}`} onPointerMove={move} onPointerLeave={leave} data-active="false">
      <div className="spotlight-inner h-full">{children}</div>
      <div className="spotlight-glare rounded-[inherit]" aria-hidden="true" />
    </div>
  );
}
