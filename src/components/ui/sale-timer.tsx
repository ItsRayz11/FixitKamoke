"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** "2d 05h 13m" while more than a day is left, otherwise "05:13:22". */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${p(h)}h ${p(m)}m` : `${p(h)}:${p(m)}:${p(sec)}`;
}

/** Plain-words version for screen readers, updated once a minute instead of every second. */
function spoken(ms: number): string {
  const mins = Math.max(0, Math.ceil(ms / 60000));
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  return [d && `${d} day${d === 1 ? "" : "s"}`, h && `${h} hour${h === 1 ? "" : "s"}`, (m || (!d && !h)) && `${m} minute${m === 1 ? "" : "s"}`].filter(Boolean).join(" ");
}

/**
 * Countdown to the end of a sale. It is given the time LEFT (counted by the server when the page was built), not an end
 * time, so a phone with a wrong clock still shows the right amount. When it reaches zero it refreshes the page, and the
 * server (which decides the price) then shows the regular price.
 */
export function SaleTimer({ msLeft, className = "" }: { msLeft: number; className?: string }) {
  const router = useRouter();
  const start = useRef<number | null>(null);
  const refreshed = useRef(false);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    start.current = performance.now();
    const tick = () => setLeft(Math.max(0, msLeft - (performance.now() - (start.current ?? 0))));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [msLeft]);

  useEffect(() => {
    if (left === 0 && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [left, router]);

  const base = `inline-flex min-h-6 items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-danger ${className}`;
  if (left === null) return <span className={base} aria-hidden="true">Sale ends soon</span>;
  if (left === 0) return <span className={base} role="status">Sale ended</span>;
  return (
    <span className={base} data-testid="sale-timer">
      <span aria-hidden="true">⏱ Ends in <span className="tabular-nums">{formatCountdown(left)}</span></span>
      <span className="sr-only" role="timer">Sale ends in {spoken(left)}</span>
    </span>
  );
}
