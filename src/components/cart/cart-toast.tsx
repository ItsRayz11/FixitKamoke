"use client";

import Link from "next/link";
import { useCart } from "./cart-store";

export function CartToast() {
  const { lastAdded, dismissToast } = useCart();
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      {lastAdded && (
        <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-[var(--radius-md)] bg-ink/95 px-4 py-3 text-sm text-white shadow-[var(--shadow-pop)] backdrop-blur-sm animate-[toast-in_200ms_var(--ease-out)]">
          <span className="line-clamp-1">Added “{lastAdded}” to cart</span>
          <Link href="/cart" className="font-semibold text-cyan underline" onClick={dismissToast}>View cart</Link>
          <button type="button" onClick={dismissToast} aria-label="Dismiss" className="ml-1 text-lg leading-none">×</button>
        </div>
      )}
    </div>
  );
}
