"use client";

import { useState } from "react";
import { useCart } from "./cart-store";

export function AddToCartButton({ productId, name, disabled, compact, max }: { productId: string; name: string; disabled?: boolean; compact?: boolean; max?: number }) {
  const { add, lines } = useCart();
  const [qty, setQty] = useState(1);
  const inCart = lines.find((l) => l.productId === productId)?.quantity ?? 0;
  const limit = max !== undefined ? Math.max(0, max - inCart) : 50;
  const atLimit = max !== undefined && limit <= 0;

  const base = "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] px-4 text-sm font-semibold transition-[transform,background-color] duration-150 active:scale-[0.97] motion-reduce:active:transform-none";
  const btn = disabled || atLimit
    ? `${base} cursor-not-allowed bg-slate-200 text-muted`
    : `${base} bg-accent text-white hover:bg-accent-strong`;

  const button = (
    <button
      type="button"
      className={`${btn} ${compact ? "w-full" : "flex-1"}`}
      disabled={disabled || atLimit}
      onClick={() => add(productId, compact ? 1 : Math.min(qty, limit), name)}
    >
      {disabled ? "Out of stock" : atLimit ? "Maximum in cart" : "Add to cart"}
    </button>
  );
  if (compact) return button;

  return (
    <div className="flex items-stretch gap-3">
      <div className="inline-flex items-center rounded-[var(--radius-sm)] border border-line bg-surface" role="group" aria-label="Quantity">
        <button type="button" className="min-h-11 w-11 text-lg" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={disabled}>−</button>
        <span className="w-8 text-center text-sm font-semibold" aria-live="polite">{Math.min(qty, Math.max(1, limit))}</span>
        <button type="button" className="min-h-11 w-11 text-lg" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(Math.max(1, limit), q + 1))} disabled={disabled}>+</button>
      </div>
      {button}
    </div>
  );
}
