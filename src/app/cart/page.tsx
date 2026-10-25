"use client";

import Link from "next/link";
import { useState } from "react";
import { useCartView } from "@/components/cart/use-cart-view";
import { formatPKR } from "@/lib/domain/money";

export default function CartPage() {
  const { cart, view, loading, failed } = useCartView();
  const [confirmClear, setConfirmClear] = useState(false);

  // Drop products the server says no longer exist.
  const missing = view?.missing ?? [];

  const hasProblem = view?.lines.some((l) => l.problem) ?? false;

  return (
    <div className="container-x py-8">
      <title>Your cart | Fixit</title>
      <h1 className="text-2xl font-extrabold">Your cart</h1>

      {failed && <p role="alert" className="mt-4 rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm text-danger">We could not load current prices. Please check your connection and refresh.</p>}
      {loading && <div className="mt-6 space-y-3" aria-busy="true" aria-label="Loading cart">{[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-[var(--radius-md)] bg-line" />)}</div>}

      {view && view.lines.length === 0 && !loading && (
        <div className="mt-6 rounded-[var(--radius-md)] border border-dashed border-line bg-surface p-10 text-center">
          <p className="font-semibold">Your cart is empty.</p>
          <Link href="/shop" className="mt-3 inline-block font-semibold text-accent">Browse products</Link>
        </div>
      )}

      {missing.length > 0 && (
        <div role="alert" className="mt-4 rounded-[var(--radius-sm)] bg-amber-50 p-3 text-sm text-warn">
          {missing.length} item{missing.length > 1 ? " is" : "s are"} no longer available.{" "}
          <button className="font-semibold underline" onClick={() => missing.forEach((id) => cart.remove(id))}>Remove</button>
        </div>
      )}

      {view && view.lines.length > 0 && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <ul className="space-y-3">
            {view.lines.map((l) => (
              <li key={l.productId} className="flex gap-4 rounded-[var(--radius-md)] border border-line bg-surface p-4" data-testid="cart-line">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-canvas">
                  {l.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote URL
                    <img src={l.image} alt="" width={80} height={80} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex-1">
                  <Link href={`/product/${l.slug}`} className="font-semibold hover:text-accent">{l.name}</Link>
                  <p className="text-sm text-muted">{formatPKR(l.unitPrice)} each</p>
                  {l.problem && <p role="alert" className="mt-1 text-sm font-semibold text-danger">{l.problem}. Please adjust the quantity.</p>}
                  <div className="mt-2 flex items-center gap-3">
                    <div className="inline-flex items-center rounded-[var(--radius-sm)] border border-line" role="group" aria-label={`Quantity for ${l.name}`}>
                      <button className="min-h-11 w-11 text-lg" aria-label="Decrease quantity" onClick={() => cart.setQuantity(l.productId, l.quantity - 1)}>−</button>
                      <span className="w-8 text-center text-sm font-semibold">{l.quantity}</span>
                      <button className="min-h-11 w-11 text-lg" aria-label="Increase quantity" onClick={() => cart.setQuantity(l.productId, Math.min(l.quantity + 1, Math.max(1, l.stock)))} disabled={l.quantity >= l.stock}>+</button>
                    </div>
                    <button className="min-h-11 text-sm font-semibold text-danger underline" onClick={() => cart.remove(l.productId)}>Remove</button>
                  </div>
                </div>
                <p className="font-bold">{formatPKR(l.lineTotal)}</p>
              </li>
            ))}
          </ul>

          <aside className="h-fit rounded-[var(--radius-md)] border border-line bg-surface p-5 lg:sticky lg:top-24" aria-label="Order summary">
            <h2 className="font-bold">Summary</h2>
            <p className="mt-3 flex justify-between text-sm"><span>Subtotal</span><strong data-testid="cart-subtotal">{formatPKR(view.subtotal)}</strong></p>
            <p className="mt-1 text-xs text-muted">Delivery is calculated at checkout from your city.</p>
            {hasProblem ? (
              <p className="mt-4 text-sm text-danger">Fix the items above to continue.</p>
            ) : (
              <Link href="/checkout" className="mt-4 flex min-h-12 items-center justify-center rounded-[var(--radius-sm)] bg-accent font-semibold text-white hover:bg-accent-strong">Checkout</Link>
            )}
            <div className="mt-3 text-center">
              {confirmClear ? (
                <span className="text-sm">Clear all items?{" "}
                  <button className="font-semibold text-danger underline" onClick={() => { cart.clear(); setConfirmClear(false); }}>Yes, clear</button>{" · "}
                  <button className="underline" onClick={() => setConfirmClear(false)}>Cancel</button>
                </span>
              ) : (
                <button className="min-h-11 text-sm text-muted underline" onClick={() => setConfirmClear(true)}>Clear cart</button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
