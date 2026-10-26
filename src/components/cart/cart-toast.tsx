"use client";

import Link from "next/link";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation } from "motion/react";
import * as m from "motion/react-m";
import { useCart } from "./cart-store";

/**
 * Add-to-cart confirmation (the confirmation half of the "Tactile Purchase Response").
 * A glass panel that says what was added and offers both next steps: keep shopping or open the cart.
 * Enter/exit use transform + opacity only and are skipped when the visitor prefers reduced motion.
 * On product pages it sits above the fixed purchase bar (see .cart-confirm in globals.css).
 */
export function CartToast() {
  const { lastAdded, dismissToast, count } = useCart();
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div aria-live="polite" role="status" className="cart-confirm pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3">
          <AnimatePresence>
            {lastAdded && (
              <m.div
                key="toast"
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
                className="glass-panel-dark pointer-events-auto w-full max-w-md rounded-[var(--radius-lg)] p-3.5 text-sm shadow-[var(--shadow-pop)]"
              >
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="check-pop mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-500 text-white">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </span>
                  <p className="min-w-0 flex-1 leading-snug"><span className="line-clamp-2">Added “{lastAdded}” to cart</span><span className="mt-0.5 block text-xs text-slate-300">{count} item{count === 1 ? "" : "s"} in your cart</span></p>
                  <button type="button" onClick={dismissToast} aria-label="Dismiss" className="-mr-1 -mt-1 inline-flex min-h-11 min-w-11 items-center justify-center text-xl leading-none text-slate-300 hover:text-white">×</button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" onClick={dismissToast} className="btn btn-glass !min-h-11">Continue shopping</button>
                  <Link href="/cart" onClick={dismissToast} className="btn btn-primary !min-h-11">Open cart</Link>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
