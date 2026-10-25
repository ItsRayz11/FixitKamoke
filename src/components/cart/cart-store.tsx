"use client";

import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { track } from "@/lib/track";

/** The browser cart only stores product ids and quantities. Prices and stock are always re-read on the server. */
export interface CartLine { productId: string; quantity: number }

interface CartApi {
  lines: CartLine[];
  count: number;
  ready: boolean;
  lastAdded: string | null;
  add: (productId: string, quantity?: number, label?: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  dismissToast: () => void;
}

const KEY = "fixit.cart.v1";
const MAX_QTY = 50;
const EMPTY: CartLine[] = [];

function load(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((l) => typeof l?.productId === "string" && Number.isInteger(l?.quantity) && l.quantity > 0).slice(0, 50)
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

// Module-level external store, shared by every component and synced across tabs.
let lines: CartLine[] | null = null;
let lastAdded: string | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const getLines = () => (lines ??= load());

function commit(next: CartLine[]) {
  lines = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable: cart lasts for this page view */ }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) { lines = load(); emit(); }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const actions = {
  add(productId: string, quantity = 1, label?: string) {
    const cur = getLines();
    const found = cur.find((l) => l.productId === productId);
    commit(found
      ? cur.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + quantity) } : l))
      : [...cur, { productId, quantity: Math.min(MAX_QTY, quantity) }]);
    track("add_to_cart");
    lastAdded = label ?? "Item";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(actions.dismissToast, 4000);
    emit();
  },
  setQuantity(productId: string, quantity: number) {
    const cur = getLines();
    commit(quantity < 1
      ? cur.filter((l) => l.productId !== productId)
      : cur.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l)));
  },
  remove(productId: string) { commit(getLines().filter((l) => l.productId !== productId)); },
  clear() { commit([]); },
  dismissToast() { lastAdded = null; emit(); },
};

const noopSubscribe = () => () => {};

export function useCart(): CartApi {
  const current = useSyncExternalStore(subscribe, getLines, () => EMPTY);
  const toast = useSyncExternalStore(subscribe, () => lastAdded, () => null);
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return useMemo(
    () => ({ lines: current, count: current.reduce((s, l) => s + l.quantity, 0), ready, lastAdded: toast, ...actions }),
    [current, ready, toast],
  );
}

/** Kept so the layout can wrap the app without changing call sites; state itself lives in the module store. */
export function CartProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
