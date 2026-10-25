"use client";

import Link from "next/link";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation } from "motion/react";
import * as m from "motion/react-m";
import { useCart } from "./cart-store";

/** Add-to-cart confirmation. Enter/exit use transform + opacity only, and are skipped when the visitor prefers reduced motion. */
export function CartToast() {
  const { lastAdded, dismissToast } = useCart();
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <AnimatePresence>
            {lastAdded && (
              <m.div
                key="toast"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                className="pointer-events-auto flex max-w-md items-center gap-3 rounded-[var(--radius-md)] bg-ink/90 px-4 py-3 text-sm text-white shadow-[var(--shadow-pop)] backdrop-blur-sm"
              >
                <span className="line-clamp-1">Added “{lastAdded}” to cart</span>
                <Link href="/cart" className="font-semibold text-cyan underline" onClick={dismissToast}>View cart</Link>
                <button type="button" onClick={dismissToast} aria-label="Dismiss" className="ml-1 min-h-8 min-w-8 text-lg leading-none">×</button>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
