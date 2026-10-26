"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCartView } from "@/components/cart/use-cart-view";
import { formatPKR } from "@/lib/domain/money";
import { Steps } from "@/components/checkout/steps";
import { track } from "@/lib/track";

export default function CartPage() {
  const { cart, view, loading, failed } = useCartView();
  const router = useRouter();
  const addParam = useSearchParams().get("add");
  const seeded = useRef(false);
  // "Order again" arrives as ?add=<id>:<qty>,... : validate strictly, add to the browser cart once, then clean the URL.
  useEffect(() => {
    if (!addParam || seeded.current || !cart.ready) return;
    seeded.current = true;
    for (const part of addParam.split(",").slice(0, 20)) {
      const [id, q] = part.split(":");
      const qty = Number(q);
      if (/^[0-9a-f-]{36}$/i.test(id) && Number.isInteger(qty) && qty >= 1 && qty <= 50) cart.add(id, qty);
    }
    router.replace("/cart");
  }, [addParam, cart, router]);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => { track("cart_view"); }, []);

  // Drop products the server says no longer exist.
  const missing = view?.missing ?? [];

  const hasProblem = view?.lines.some((l) => l.problem) ?? false;

  return (
    <div className="container-x has-purchase-bar py-6 sm:py-8 lg:pb-8">
      <title>Your cart | Fixit</title>
      <h1 className="text-2xl font-extrabold">Your cart</h1>
      <Steps current={1} />

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
              <li key={l.productId} className="flex flex-wrap gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-3 shadow-[var(--shadow-card)] sm:gap-4 sm:p-4" data-testid="cart-line">
                <div className="stage h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)]">
                  {l.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote URL
                    <img src={l.image} alt="" width={80} height={80} className="h-full w-full object-contain p-1" />
                  )}
                </div>
                <div className="min-w-0 flex-1 basis-40">
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
                <p className="basis-full text-right text-sm font-bold sm:basis-auto sm:text-base">{formatPKR(l.lineTotal)}</p>
              </li>
            ))}
          </ul>

          <aside className="h-fit rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] lg:sticky lg:top-24" aria-label="Order summary">
            <h2 className="font-bold">Summary</h2>
            <p className="mt-3 flex justify-between text-sm"><span>Subtotal</span><strong data-testid="cart-subtotal">{formatPKR(view.subtotal)}</strong></p>
            <p className="mt-1 text-xs text-muted">Delivery is added at checkout once you enter your city. You will see the full total before you place the order.</p>
            {hasProblem ? (
              <p className="mt-4 text-sm text-danger">Fix the items above to continue.</p>
            ) : (
              <div className="purchase-bar lg:static lg:mt-4 lg:p-0">
                <div className="glass-panel mx-auto flex max-w-xl items-center gap-3 rounded-[var(--radius-lg)] p-2.5 pl-4 lg:!border-0 lg:!bg-transparent lg:!p-0 lg:!shadow-none lg:![backdrop-filter:none]">
                  <p className="min-w-0 flex-1 leading-tight lg:hidden"><span className="block text-xs text-muted">Subtotal</span><span className="text-base font-extrabold">{formatPKR(view.subtotal)}</span></p>
                  <Link href="/checkout" className="btn btn-primary !min-h-12 min-w-36 lg:w-full">Checkout</Link>
                </div>
              </div>
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
