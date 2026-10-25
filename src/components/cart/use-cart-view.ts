"use client";

import { useEffect, useState } from "react";
import { getCartView, type CartView } from "@/app/actions/checkout";
import { useCart } from "./cart-store";

/** Loads authoritative prices/stock for the browser cart. `loading` stays true until the first server response. */
export function useCartView() {
  const cart = useCart();
  const [view, setView] = useState<CartView | null>(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(cart.lines);

  useEffect(() => {
    if (!cart.ready) return;
    let cancelled = false;
    getCartView(JSON.parse(key))
      .then((v) => { if (!cancelled) { setView(v); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [key, cart.ready]);

  const empty = cart.ready && cart.lines.length === 0;
  return { cart, view: empty ? { lines: [], subtotal: 0, missing: [] } : view, loading: !empty && view === null && !failed, failed };
}
