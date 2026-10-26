"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const KEY = "fixit.compare.v1";
const MAX = 3;
const EMPTY: string[] = [];
let cache: string[] | null = null;
const listeners = new Set<() => void>();

function read(): string[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, MAX) : EMPTY;
  } catch { cache = EMPTY; }
  return cache;
}
function write(next: string[]) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export function useCompare() {
  const ids = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    ids,
    toggle: (id: string) => write(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(-MAX)),
    remove: (id: string) => write(ids.filter((x) => x !== id)),
    clear: () => write([]),
  };
}

/** Adds this product to a short comparison list (max 3) kept in this browser only. */
export function CompareButton({ productId }: { productId: string }) {
  const { ids, toggle } = useCompare();
  const on = ids.includes(productId);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4">
      <button type="button" onClick={() => toggle(productId)} aria-pressed={on} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline">
        {on ? "Remove from comparison" : "Compare with other products"}
      </button>
      {ids.length > 0 && <Link href="/compare" className="inline-flex min-h-11 items-center text-sm font-semibold">View comparison ({ids.length})</Link>}
    </div>
  );
}
