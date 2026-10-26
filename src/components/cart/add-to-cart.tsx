"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "./cart-store";

/** Quick add used on product cards and in lists. The product page has its own richer control (finish choice, purchase bar). */
export function AddToCartButton({ productId, name, disabled, compact, max }: { productId: string; name: string; disabled?: boolean; compact?: boolean; max?: number }) {
  const { add, lines } = useCart();
  const [qty, setQty] = useState(1);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const inCart = lines.find((l) => l.productId === productId)?.quantity ?? 0;
  const limit = max !== undefined ? Math.max(0, max - inCart) : 50;
  const atLimit = max !== undefined && limit <= 0;
  const off = disabled || atLimit;

  const button = (
    <button
      type="button"
      className={`btn btn-primary ${done ? "btn-done" : ""} ${compact ? "w-full" : "flex-1"}`}
      disabled={off}
      onClick={() => {
        add(productId, compact ? 1 : Math.min(qty, limit), name);
        setDone(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1400);
      }}
    >
      {disabled ? "Out of stock" : atLimit ? "Maximum in cart" : done ? "Added" : "Add to cart"}
    </button>
  );
  if (compact) return button;

  return (
    <div className="flex items-stretch gap-3">
      <div className="btn-ti inline-flex items-center rounded-[var(--radius-sm)]" role="group" aria-label="Quantity">
        <button type="button" className="min-h-11 w-11 text-lg" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={disabled}>−</button>
        <span className="w-8 text-center text-sm font-semibold" aria-live="polite">{Math.min(qty, Math.max(1, limit))}</span>
        <button type="button" className="min-h-11 w-11 text-lg" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(Math.max(1, limit), q + 1))} disabled={disabled}>+</button>
      </div>
      {button}
    </div>
  );
}
